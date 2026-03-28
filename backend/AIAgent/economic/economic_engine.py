import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

MIN_COST = 10


def run_economic_engine(
    decision_output: dict,
    intelligence_state: dict,
    simulation_output: dict,
) -> dict:

    # -----------------------------
    # 1. Fetch economic signals
    # -----------------------------
    oil_price = 85
    currency_index = 1.1
    demand_index = intelligence_state.get("total_risk", 50)

    # -----------------------------
    # 2. Compute multipliers
    # -----------------------------
    shipping_factor = oil_price / 70
    demand_factor = 1 + (demand_index / 100)
    currency_factor = currency_index

    # Combine multiplier
    multiplier = shipping_factor * demand_factor * currency_factor

    # Guardrail: cap multiplier
    multiplier = min(multiplier, 2.0)

    logger.info(f"Economic multiplier: {multiplier}")

    # -----------------------------
    # 3. Apply to routes
    # -----------------------------
    routes_output = []

    strategies = decision_output.get("strategies", {})

    for key, route_data in strategies.items():
        if not route_data:
            continue

        if not isinstance(route_data, dict):
            continue
        metrics   = route_data.get("metrics", {})
        base_cost = metrics.get("distance", 14000)

        adjusted_cost = base_cost * multiplier

        # Guardrails
        adjusted_cost = max(adjusted_cost, MIN_COST)

        increase_pct = ((adjusted_cost - base_cost) / base_cost) * 100

        if increase_pct > 50:
            adjusted_cost = base_cost * 1.5  # cap spike

        routes_output.append({
            "route_id": key,
            "base_cost": base_cost,
            "adjusted_cost": round(adjusted_cost, 2),
            "economic_factors": {
                "oil": round(shipping_factor, 2),
                "demand": round(demand_factor, 2),
                "currency": round(currency_factor, 2),
            }
        })

    # -----------------------------
    # 4. Select best route
    # -----------------------------
    recommended = min(routes_output, key=lambda x: x["adjusted_cost"]) if routes_output else None

    # -----------------------------
    # 5. Summary
    # -----------------------------
    summary = {
        "oil_impact_percent": round((shipping_factor - 1) * 100, 2),
        "demand_impact_percent": round((demand_factor - 1) * 100, 2),
        "total_cost_increase_percent": round((multiplier - 1) * 100, 2),
    }

    return {
        "routes": routes_output,
        "economic_summary": summary,
        "recommended_route": recommended,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }