import unittest

import numpy as np
from sklearn.model_selection import GroupShuffleSplit
from xgboost import XGBClassifier

from ml.train import ARTIFACTS, synthetic


class ModelTests(unittest.TestCase):
    def test_deterministic_scenarios(self):
        first = synthetic()
        second = synthetic()
        for a, b in zip(first, second):
            np.testing.assert_array_equal(a, b)

    def test_groups_do_not_leak(self):
        x, y, groups = synthetic()
        train, test = next(GroupShuffleSplit(test_size=.25, random_state=42).split(x, y, groups))
        self.assertFalse(set(groups[train]) & set(groups[test]))
        self.assertEqual(len(set(y[test])), 2)

    def test_model_separates_known_test_patterns(self):
        model = XGBClassifier()
        model.load_model(ARTIFACTS / "xgboost.json")
        p = model.predict_proba(np.asarray([[0, 0, 0, 0, 0, 0, 0, 1], [1, 0, .9, 0, 0, 1, 0, .98]]))[:, 1]
        self.assertLess(p[0], .5)
        self.assertGreater(p[1], .5)


if __name__ == "__main__":
    unittest.main()
