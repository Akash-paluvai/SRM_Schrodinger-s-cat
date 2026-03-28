"""
SupplierAgent — Assesses supply chain risk based on supplier reliability data.
Data source: Local CSV file (supplier_data.csv).
Uses scikit-learn for ML-based risk prediction.
"""

import os
import csv
from agents.base_agent import BaseAgent
from sklearn.ensemble import RandomForestRegressor
import numpy as np


DEFAULT_CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "supplier_data.csv")


class SupplierAgent(BaseAgent):
    """Evaluates supplier reliability risk using ML prediction."""

    def __init__(self, csv_path: str | None = None):
        super().__init__()
        self.name = "supplier"
        self.tools = ["CSV file (supplier_data.csv)", "Scikit-learn ML"]
        self.csv_path = csv_path or os.path.abspath(DEFAULT_CSV_PATH)
        # ML model: Random Forest for predicting risk from features
        self.model = RandomForestRegressor(n_estimators=10, random_state=42)

    def fetch_data(self) -> list[dict] | None:
        """Read supplier data from CSV."""
        if not os.path.exists(self.csv_path):
            self.logger.error(f"CSV not found: {self.csv_path}")
            return None

        rows = []
        with open(self.csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)

        if not rows:
            self.logger.warning("CSV is empty")
            return None

        self.logger.info(f"Loaded {len(rows)} supplier records")
        return rows

    def process(self, data: list[dict]) -> dict:
        """
        Extract features and train/predict risk.

        Features: reliability_score, perhaps others if available.
        """
        features = []
        reliabilities = []
        suppliers = []

        for row in data:
            try:
                reliability = float(row.get("reliability_score", 0.5))
                # Assume other features like 'on_time_delivery' if present
                on_time = float(row.get("on_time_delivery", 0.8))
                features.append([reliability, on_time])
                reliabilities.append(reliability)
                suppliers.append({
                    "name": row.get("supplier_name", "Unknown"),
                    "reliability": reliability,
                })
            except (ValueError, TypeError):
                continue

        if not features:
            return {"avg_reliability": 0.5, "supplier_count": 0, "predicted_risk": 50}

        # Train model on features to predict risk (inverse of reliability)
        X = np.array(features)
        y = np.array([100 - r * 100 for r in reliabilities])  # Risk = 100 - reliability*100
        self.model.fit(X, y)

        # Predict average risk
        avg_features = np.mean(X, axis=0).reshape(1, -1)
        predicted_risk = self.model.predict(avg_features)[0]

        avg_reliability = np.mean(reliabilities)
        min_reliability = min(reliabilities) if reliabilities else 0.5
        worst_supplier = min(suppliers, key=lambda s: s["reliability"]) if suppliers else {"name": "N/A", "reliability": 0.5}

        return {
            "avg_reliability": round(avg_reliability, 3),
            "min_reliability": round(min_reliability, 3),
            "supplier_count": len(reliabilities),
            "worst_supplier": worst_supplier,
            "predicted_risk": round(predicted_risk, 2),
        }

    def compute_risk(self, processed: dict) -> tuple[float, str, float]:
        """
        Use ML-predicted risk score.

        Algorithm: Random Forest regression on supplier features.
        """
        risk_score = processed["predicted_risk"]

        worst = processed["worst_supplier"]
        reason = (
            f"ML-predicted risk: {risk_score} based on supplier data. "
            f"Avg reliability: {processed['avg_reliability']} across "
            f"{processed['supplier_count']} suppliers. "
            f"Worst: {worst['name']} ({worst['reliability']})"
        )
        confidence = min(0.9, 0.5 + (processed["supplier_count"] / 20))
        return risk_score, reason, confidence
