"""
Risk aggregation utilities.
Combines individual agent risk scores into a final weighted risk assessment.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Agent weights for final risk aggregation
AGENT_WEIGHTS = {
    "weather": 0.3,
    "news": 0.3,
    "traffic": 0.2,
    "supplier": 0.1,
    "demand": 0.1,
}


def aggregate_risk(agent_outputs: list[dict]) -> dict:
    """
    Compute a weighted average risk score from all agent outputs.

    Args:
        agent_outputs: List of dicts with 'agent' and 'risk_score' keys.

    Returns:
        Dictionary with agent results, final risk, and metadata.
    """
    weighted_sum = 0.0
    total_weight = 0.0

    for output in agent_outputs:
        agent_name = output.get("agent", "unknown")
        risk_score = output.get("risk_score", 0)
        weight = AGENT_WEIGHTS.get(agent_name, 0.1)

        weighted_sum += risk_score * weight
        total_weight += weight
        logger.info(
            f"  [{agent_name.upper()}] risk={risk_score}, weight={weight}"
        )

    final_risk = round(weighted_sum / total_weight, 2) if total_weight > 0 else 0.0

    result = {
        "agents": agent_outputs,
        "final_risk": final_risk,
        "risk_level": classify_risk(final_risk),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(f"  Final aggregated risk: {final_risk} ({result['risk_level']})")
    return result


def classify_risk(score: float) -> str:
    """
    Classify a numeric risk score into a human-readable level.

    Args:
        score: Risk score between 0 and 100.

    Returns:
        Risk level string.
    """
    if score >= 75:
        return "CRITICAL"
    elif score >= 50:
        return "HIGH"
    elif score >= 25:
        return "MODERATE"
    else:
        return "LOW"
