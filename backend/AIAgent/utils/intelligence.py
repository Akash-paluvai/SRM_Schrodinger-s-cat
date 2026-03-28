import numpy as np

# store last run risk (simple memory)
_last_total_risk = None

def build_intelligence_state(agent_outputs: list[dict]) -> dict:
    global _last_total_risk

    # ---- Ensure all agents exist ----
    expected_agents = ["weather", "news", "traffic", "supplier", "demand"]

    for agent in expected_agents:
        if not any(a["agent"] == agent for a in agent_outputs):
            agent_outputs.append({
                "agent": agent,
                "risk_score": 30,
                "confidence": 0.5,
                "trend": 0,
                "volatility": 0.2,
                "region": "unknown"
            })

    # ---- Weights (same as your system) ----
    weights = {
        "weather": 0.3,
        "news": 0.3,
        "traffic": 0.2,
        "supplier": 0.1,
        "demand": 0.1
    }

    # ---- Total Risk ----
    total_risk = sum(
        a["risk_score"] * weights.get(a["agent"], 0)
        for a in agent_outputs
    )

    # ---- Risk Breakdown ----
    risk_breakdown = {
        a["agent"]: a["risk_score"] for a in agent_outputs
    }

    # ---- Volatility ----
    risks = [a["risk_score"] for a in agent_outputs]
    volatility = float(np.var(risks))

    # ---- Trend ----
    trend = 0
    if _last_total_risk is not None:
        trend = total_risk - _last_total_risk

    _last_total_risk = total_risk

    # ---- Dominant Risk ----
    dominant_risk = max(agent_outputs, key=lambda x: x["risk_score"])["agent"]

    return {
        "total_risk": round(total_risk, 2),
        "risk_breakdown": risk_breakdown,
        "trend": round(trend, 2),
        "volatility": round(volatility, 3),
        "dominant_risk": dominant_risk
    }