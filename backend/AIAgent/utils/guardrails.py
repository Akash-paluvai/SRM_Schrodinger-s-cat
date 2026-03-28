def apply_guardrails(agent_output: dict) -> dict:
    # Clamp values
    agent_output["risk_score"] = max(0, min(100, agent_output.get("risk_score", 30)))
    agent_output["confidence"] = max(0, min(1, agent_output.get("confidence", 0.5)))

    # Confidence fallback
    if agent_output["confidence"] < 0.3:
        agent_output["risk_score"] = 30

    return agent_output