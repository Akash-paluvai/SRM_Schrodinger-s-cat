"""
Cost Function Module.

Defines how edge weights are computed from distance, risk, and delay.
Weights are fully configurable — pass a custom CostConfig to override defaults.

Default formula:
    weight = 0.5 * distance + 0.3 * risk + 0.2 * delay
"""

from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
@dataclass
class CostConfig:
    """
    Weight coefficients for the edge cost function.
    Must sum to 1.0 for interpretable scores (not enforced, only logged).
    """
    distance_weight: float = 0.5
    risk_weight:     float = 0.3
    delay_weight:    float = 0.2

    def __post_init__(self):
        total = self.distance_weight + self.risk_weight + self.delay_weight
        if abs(total - 1.0) > 1e-6:
            logger.warning(
                f"CostConfig weights sum to {total:.4f}, not 1.0 — "
                "scores may not be directly comparable"
            )


# Default shared config
DEFAULT_COST_CONFIG = CostConfig()


# ---------------------------------------------------------------------------
# Core cost function
# ---------------------------------------------------------------------------
def compute_edge_weight(
    distance: float,
    risk: float,
    delay: float,
    config: CostConfig = DEFAULT_COST_CONFIG,
) -> float:
    """
    Compute a single scalar edge weight combining all cost factors.

    Args:
        distance: Normalised distance (0–1 or raw km — keep consistent).
        risk:     Normalised risk score (0–1).
        delay:    Normalised delay (0–1 or days — keep consistent).
        config:   Weight coefficients (defaults to 0.5 / 0.3 / 0.2).

    Returns:
        Scalar edge weight (higher = worse route).
    """
    weight = (
        config.distance_weight * distance
        + config.risk_weight    * risk
        + config.delay_weight   * delay
    )
    return round(weight, 6)


def normalise_risk(raw_risk_score: float, scale: float = 100.0) -> float:
    """Normalise a 0–100 agent risk score to 0–1."""
    return round(max(0.0, min(raw_risk_score, scale)) / scale, 6)


def normalise_delay(raw_delay_days: float, max_days: float = 60.0) -> float:
    """Normalise delay in days to 0–1 using a configurable ceiling."""
    return round(max(0.0, min(raw_delay_days, max_days)) / max_days, 6)


def normalise_distance(raw_km: float, max_km: float = 25_000.0) -> float:
    """Normalise distance in km to 0–1 using Earth's circumference as ceiling."""
    return round(max(0.0, min(raw_km, max_km)) / max_km, 6)
