def build_context(data: dict) -> dict:
    return {
        "risk": data["intelligence_state"].get("total_risk"),
        "delay": data["simulation"].get("expected_delay"),
        "best_route": data["decision"].get("strategies", {}).get("balanced_route"),
        "alternatives": list(data["decision"].get("strategies", {}).keys()),
        "economic_impact": data.get("economic", {}).get("economic_summary", {}),
    }