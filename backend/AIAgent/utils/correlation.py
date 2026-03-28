def detect_correlations(agent_outputs: list[dict]) -> list[str]:
    correlations = []

    weather = next((a for a in agent_outputs if a["agent"] == "weather"), None)
    traffic = next((a for a in agent_outputs if a["agent"] == "traffic"), None)

    if weather and traffic:
        if weather["risk_score"] > 50 and traffic["risk_score"] > 50:
            correlations.append("weather+traffic")

    return correlations