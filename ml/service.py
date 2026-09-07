"""Private model service. Run on loopback or a private container network only."""
import hmac
import json
import os
from contextlib import asynccontextmanager

import joblib
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from xgboost import DMatrix, XGBClassifier

from ml.train import ARTIFACTS, FEATURES


@asynccontextmanager
async def lifespan(app):
    if not os.environ.get("ML_SERVICE_TOKEN"):
        raise RuntimeError("ML_SERVICE_TOKEN is required")
    if not (ARTIFACTS / "report.json").exists():
        raise RuntimeError("Train models first: python -m ml.train")
    app.state.model = XGBClassifier()
    app.state.model.load_model(ARTIFACTS / "xgboost.json")
    # Only locally trained artifacts are loaded. Never accept uploaded pickle/joblib files.
    app.state.novelty = joblib.load(ARTIFACTS / "isolation_forest.joblib")
    app.state.report = json.loads((ARTIFACTS / "report.json").read_text())
    yield


app = FastAPI(title="MedSentinel model service", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


def authorize(request: Request):
    if not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + os.environ["ML_SERVICE_TOKEN"]):
        raise HTTPException(status_code=401, detail="Unauthorized")


class Input(BaseModel):
    features: list[float] = Field(min_length=8, max_length=8)


@app.get("/health", dependencies=[Depends(authorize)])
def health():
    return app.state.report


@app.post("/predict", dependencies=[Depends(authorize)])
def predict(body: Input):
    x = np.asarray([body.features])
    if not np.isfinite(x).all() or (x < 0).any() or (x > 1).any():
        raise HTTPException(status_code=422, detail="Features must be finite and in [0,1]")
    probability = float(app.state.model.predict_proba(x)[0, 1])
    novelty = float(np.clip(-app.state.novelty.decision_function(x)[0] * 5, 0, 1))
    contributions = app.state.model.get_booster().predict(DMatrix(x), pred_contribs=True)[0][:-1]
    return {"version": app.state.report["version"], "attackProbability": probability, "novelty": novelty, "contributions": dict(zip(FEATURES, map(float, contributions)))}
