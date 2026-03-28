"""
TrafficAgent — Assesses supply chain risk based on road traffic congestion.
Data source: TomTom Traffic Flow API.
Uses scikit-learn for ML-based risk prediction.
"""

from agents.base_agent import BaseAgent
from services.api_clients import fetch_traffic
from sklearn.linear_model import LinearRegression
import numpy as np

# Default coordinates: Mumbai port area
DEFAULT_LAT = 18.9388
DEFAULT_LON = 72.8354


class TrafficAgent(BaseAgent):
    """Evaluates traffic congestion risk using ML prediction."""

    def __init__(self, lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON):
        super().__init__()
        self.name = "traffic"
        self.tools = ["TomTom Traffic Flow API", "Scikit-learn ML"]
        self.lat = lat
        self.lon = lon
        # Simple ML model: Linear regression on congestion ratio
        self.model = LinearRegression()
        # Train with sample data (in practice, use historical data)
        X_sample = np.array([[0.1], [0.3], [0.5], [0.8]])  # Congestion ratios
        y_sample = np.array([20, 40, 60, 90])  # Risk scores
        self.model.fit(X_sample, y_sample)

    def fetch_data(self) -> dict | None:
        """Fetch traffic flow data for the configured coordinates."""
        return fetch_traffic(self.lat, self.lon)

    def process(self, data: dict) -> dict:
        """
        Extract traffic flow metrics and compute congestion.

        Algorithm: Congestion ratio = 1 - (currentSpeed / freeFlowSpeed)
        """
        flow = data.get("flowSegmentData", {})
        current_speed = flow.get("currentSpeed", 0)
        free_flow_speed = flow.get("freeFlowSpeed", 1)
        current_tt = flow.get("currentTravelTime", 0)
        free_flow_tt = flow.get("freeFlowTravelTime", 1)

        if free_flow_speed > 0:
            congestion_ratio = 1 - (current_speed / free_flow_speed)
        else:
            congestion_ratio = 0

        return {
            "current_speed": current_speed,
            "free_flow_speed": free_flow_speed,
            "congestion_ratio": round(congestion_ratio, 3),
            "current_travel_time": current_tt,
            "free_flow_travel_time": free_flow_tt,
        }

    def compute_risk(self, processed: dict) -> tuple[float, str, float]:
        """
        Predict risk using ML model based on congestion ratio.

        Algorithm: Linear regression on congestion ratio to predict risk score.
        """
        ratio = processed["congestion_ratio"]
        predicted_risk = self.model.predict(np.array([[ratio]]))[0]
        risk_score = max(0, min(100, predicted_risk))

        pct = round(ratio * 100)
        delay_factor = round(
            (processed["current_travel_time"] / max(processed["free_flow_travel_time"], 1) - 1) * 100
        ) if processed.get("free_flow_travel_time") else 0

        if ratio > 0.6:
            headline = (f"Heavy congestion — traffic at {processed['current_speed']} km/h "
                        f"({pct}% below free-flow). Significant port access delays expected.")
        elif ratio > 0.3:
            headline = (f"Moderate congestion — {pct}% below free-flow speed. "
                        f"Minor delays possible on approach routes.")
        else:
            headline = (f"Traffic flowing at {processed['current_speed']} km/h. "
                        f"Port access conditions normal.")

        processed["headline"] = headline

        reason = (
            f"ML-predicted risk: {risk_score:.1f} | congestion {pct}% "
            f"(speed {processed['current_speed']}/{processed['free_flow_speed']} km/h, "
            f"travel time +{delay_factor}% vs free-flow)"
        )
        confidence = 0.85
        return risk_score, reason, confidence
