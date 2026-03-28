"""
Base agent class.
All agents inherit from this and implement fetch_data, process, and compute_risk.
"""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone


class BaseAgent(ABC):
    """Abstract base class for all risk-assessment agents."""

    def __init__(self):
        self.name: str = ""
        self.tools: list[str] = []
        self.logger = logging.getLogger(self.__class__.__name__)

    # ------------------------------------------------------------------
    # Abstract interface — subclasses MUST implement these
    # ------------------------------------------------------------------
    @abstractmethod
    def fetch_data(self) -> dict | list | None:
        """Fetch raw data from the agent's data source."""
        ...

    @abstractmethod
    def process(self, data) -> dict:
        """Process raw data into structured signals."""
        ...

    @abstractmethod
    def compute_risk(self, processed_data: dict) -> tuple[float, str, float]:
        """
        Compute risk from processed data.

        Returns:
            Tuple of (risk_score: 0-100, reason: str, confidence: 0-1).
        """
        ...

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------
    def run(self) -> dict:
        """
        Execute the full agent pipeline: fetch → process → risk → format.

        Returns:
            Structured risk output dict.
        """
        self.logger.info(f"Agent [{self.name.upper()}] starting...")
        try:
            data = self.fetch_data()

            if data is None:
                self.logger.warning(
                    f"[{self.name.upper()}] fetch_data returned None — using fallback"
                )
                return self.format_output(30.0, "Data unavailable — fallback risk", 0.3)

            processed = self.process(data)
            risk_score, reason, confidence = self.compute_risk(processed)
            result = self.format_output(risk_score, reason, confidence)
            result["raw_data"] = processed   # expose processed fields to frontend

            self.logger.info(
                f"Agent [{self.name.upper()}] complete — risk={risk_score}"
            )
            return result

        except Exception as exc:
            self.logger.error(f"[{self.name.upper()}] failed: {exc}", exc_info=True)
            return self.format_output(30.0, f"Agent error — fallback risk: {exc}", 0.2)

    # ------------------------------------------------------------------
    # Output formatting
    # ------------------------------------------------------------------
    def format_output(self, risk_score: float, reason: str,
                      confidence: float) -> dict:
        """
        Create a standardised output dict.

        Args:
            risk_score: Numeric risk score (0-100).
            reason: Human-readable explanation.
            confidence: Confidence level (0-1).

        Returns:
            Structured output dict.
        """
        return {
            "agent": self.name,
            "risk_score": round(min(max(risk_score, 0), 100), 2),
            "reason": reason,
            "confidence": round(min(max(confidence, 0), 1), 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
