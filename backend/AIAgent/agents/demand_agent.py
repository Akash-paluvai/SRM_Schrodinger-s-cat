"""
DemandAgent — Assesses supply chain risk based on demand trend spikes.
Data source: pytrends (Google Trends).
Uses scikit-learn for time series analysis and ML forecasting.
"""

from agents.base_agent import BaseAgent
from sklearn.linear_model import LinearRegression
import numpy as np


class DemandAgent(BaseAgent):
    """Evaluates demand-spike risk using ML time series analysis."""

    def __init__(self, keywords: list[str] | None = None):
        super().__init__()
        self.name = "demand"
        self.tools = ["pytrends (Google Trends)", "Scikit-learn ML"]
        self.keywords = keywords or ["supply chain", "shipping delay"]
        self.model = LinearRegression()

    def fetch_data(self) -> dict | None:
        """
        Fetch interest-over-time data from Google Trends.

        Returns a dict with trend values or None on failure.
        """
        try:
            from pytrends.request import TrendReq

            pytrends = TrendReq(hl="en-US", tz=330, timeout=(10, 25))
            pytrends.build_payload(
                self.keywords,
                cat=0,
                timeframe="now 7-d",
                geo="",
            )
            df = pytrends.interest_over_time()

            if df.empty:
                self.logger.warning("Google Trends returned empty data")
                return None

            # Convert to plain dict for processing
            result = {}
            for kw in self.keywords:
                if kw in df.columns:
                    values = df[kw].tolist()
                    result[kw] = values

            return result

        except ImportError:
            self.logger.error(
                "pytrends not installed. Install with: pip install pytrends"
            )
            return None
        except Exception as exc:
            self.logger.error(f"pytrends fetch failed: {exc}")
            return None

    def process(self, data: dict) -> dict:
        """
        Analyze trends and forecast spikes using ML.

        Algorithm: Fit linear regression to predict next value, compute spike.
        """
        spikes = {}
        forecasts = {}

        for keyword, values in data.items():
            if not values or len(values) < 3:
                spikes[keyword] = 0.0
                forecasts[keyword] = 0.0
                continue

            # Prepare data for regression
            X = np.arange(len(values)).reshape(-1, 1)
            y = np.array(values)

            self.model.fit(X, y)

            # Forecast next value
            next_x = np.array([[len(values)]])
            forecast = self.model.predict(next_x)[0]
            forecasts[keyword] = forecast

            # Compute spike as (forecast - avg) / avg * 100
            avg = np.mean(y)
            if avg > 0:
                spike_pct = ((forecast - avg) / avg) * 100
            else:
                spike_pct = 0.0

            spikes[keyword] = round(spike_pct, 2)

        max_spike = max(spikes.values()) if spikes else 0.0

        return {
            "spikes": spikes,
            "forecasts": forecasts,
            "max_spike": max_spike,
        }

    def compute_risk(self, processed: dict) -> tuple[float, str, float]:
        """
        Map forecasted demand spike to risk score using ML.

        Algorithm: Linear regression forecasting, risk based on spike magnitude.
        """
        spike = processed["max_spike"]

        if spike > 50:
            risk_score = 90
        elif spike > 30:
            risk_score = 70
        elif spike > 10:
            risk_score = 40
        else:
            risk_score = 20

        reason = (
            f"ML-forecasted max spike: {spike:.1f}% "
            f"(forecasts: {', '.join([f'{k}:{v:.1f}' for k,v in processed['forecasts'].items()])})"
        )
        confidence = 0.75
        return risk_score, reason, confidence
