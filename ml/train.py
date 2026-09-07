"""Reproducible research training. Synthetic metrics are not clinical validation."""
import argparse
import csv
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import average_precision_score, brier_score_loss, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from xgboost import XGBClassifier

FEATURES = ["orderMismatch", "vitalDiscordance", "authFailures", "packetLoss", "deviceError", "configChange", "latency", "signalQuality"]
ARTIFACTS = Path(__file__).parent / "artifacts"


def synthetic(seed=42):
    rng = np.random.default_rng(seed)
    rows, labels, groups = [], [], []
    # Each scenario/device group has a persistent latent state. Never split its rows.
    for group in range(800):
        cause = group % 6
        base = rng.beta(1, 15, 8)
        base[7] = rng.uniform(.85, 1)
        if cause == 1:  # cyberattack
            base[[0, 2, 5]] = rng.uniform(.3, 1, 3)
        elif cause == 2:  # device fault
            base[[1, 4]] = rng.uniform(.4, 1, 2)
            base[7] = rng.uniform(.1, .65)
        elif cause == 3:  # network interruption
            base[[3, 6]] = rng.uniform(.3, 1, 2)
        elif cause == 4:  # workflow error
            base[0] = rng.uniform(.4, 1)
            base[5] = rng.uniform(.1, .5)
        elif cause == 5:  # software fault, overlapping cyber features
            base[[0, 5, 6]] = rng.uniform(.2, .8, 3)
            base[2] = rng.uniform(.05, .4)
        for _ in range(4):
            rows.append(np.clip(base + rng.normal(0, .06, 8), 0, 1))
            labels.append(int(cause == 1))
            groups.append(group)
    return np.asarray(rows), np.asarray(labels), np.asarray(groups)


def load_csv(path):
    with open(path, newline="") as source:
        records = list(csv.DictReader(source))
    if not records or not set(FEATURES + ["label", "group"]).issubset(records[0]):
        raise ValueError("CSV requires eight feature columns, label (0/1), and group.")
    x = np.asarray([[float(r[k]) for k in FEATURES] for r in records])
    y = np.asarray([int(r["label"]) for r in records])
    groups = np.asarray([r["group"] for r in records])
    if not np.isfinite(x).all() or (x < 0).any() or (x > 1).any() or not set(y).issubset({0, 1}):
        raise ValueError("Features must be finite in [0,1]; labels must be binary.")
    if len(set(groups)) < 10:
        raise ValueError("Provide at least ten independent groups.")
    return x, y, groups


def metrics(y, p):
    predicted = p >= .5
    ece = 0.0
    for low in np.linspace(0, .9, 10):
        mask = (p >= low) & (p < low + .1 if low < .9 else p <= 1)
        if mask.any():
            ece += mask.mean() * abs(p[mask].mean() - y[mask].mean())
    return {"precision": float(precision_score(y, predicted, zero_division=0)), "recall": float(recall_score(y, predicted, zero_division=0)), "f1": float(f1_score(y, predicted, zero_division=0)), "auroc": float(roc_auc_score(y, p)), "auprc": float(average_precision_score(y, p)), "brier": float(brier_score_loss(y, p)), "ece": float(ece), "false_positive_rate": float(predicted[y == 0].mean())}


def train(csv_path=None):
    x, y, groups = load_csv(csv_path) if csv_path else synthetic()
    train_idx, test_idx = next(GroupShuffleSplit(n_splits=1, test_size=.25, random_state=42).split(x, y, groups))
    assert not set(groups[train_idx]) & set(groups[test_idx])
    if len(set(y[train_idx])) != 2 or len(set(y[test_idx])) != 2:
        raise ValueError("Both train and test groups must contain both labels.")
    model = XGBClassifier(n_estimators=100, max_depth=3, learning_rate=.08, random_state=42, n_jobs=2, eval_metric="logloss")
    forest = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42, n_jobs=2, class_weight="balanced")
    # Benign here means attack-negative; includes non-cyber faults by design.
    novelty = IsolationForest(n_estimators=100, random_state=42, contamination=.05, n_jobs=2)
    model.fit(x[train_idx], y[train_idx])
    forest.fit(x[train_idx], y[train_idx])
    novelty.fit(x[train_idx][y[train_idx] == 0])
    ablation = XGBClassifier(n_estimators=100, max_depth=3, learning_rate=.08, random_state=42, n_jobs=2, eval_metric="logloss")
    security_columns = [2, 3, 5, 6]
    ablation.fit(x[train_idx][:, security_columns], y[train_idx])
    report = {"version": "synthetic-fusion-v1" if not csv_path else "normalized-csv-fusion-v1", "dataset": "Controlled synthetic scenarios (seed 42)" if not csv_path else Path(csv_path).name, "synthetic": not bool(csv_path), "features": FEATURES, "train_rows": len(train_idx), "test_rows": len(test_idx), "train_groups": len(set(groups[train_idx])), "test_groups": len(set(groups[test_idx])), "group_overlap": 0, "threshold": .5, "metrics": {"XGBoost": metrics(y[test_idx], model.predict_proba(x[test_idx])[:, 1]), "Random Forest": metrics(y[test_idx], forest.predict_proba(x[test_idx])[:, 1]), "Security-only ablation": metrics(y[test_idx], ablation.predict_proba(x[test_idx][:, security_columns])[:, 1])}, "limitations": ["Not clinically validated or prospectively calibrated.", "No real patients; no claim of public-dataset performance." if not csv_path else "Only as representative as the operator-provided CSV and grouping.", "Event-level false-positive rate is not false alarms per patient-day.", "No prospective detection-delay or subgroup validation.", "Root-cause ranking is heuristic, independent of this attack classifier."]}
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    model.save_model(ARTIFACTS / "xgboost.json")
    joblib.dump(forest, ARTIFACTS / "random_forest.joblib")
    joblib.dump(novelty, ARTIFACTS / "isolation_forest.joblib")
    (ARTIFACTS / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Normalized, authorized feature CSV; never raw patient exports")
    args = parser.parse_args()
    train(args.csv)
