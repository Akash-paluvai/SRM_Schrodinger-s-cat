SLA_LIMIT    = 30     # days
BUDGET_LIMIT = 25000  # km


def compute_route_metrics(route, intelligence, simulation):
    # route is a list of node names e.g. ["Mumbai", "Suez Canal", "Rotterdam"]
    if isinstance(route, list):
        approx_distance_km = max(len(route) - 1, 1) * 7000
    else:
        approx_distance_km = 14000
    return {
        "distance": approx_distance_km,
        "risk":     intelligence.get("total_risk", 50),
        "delay":    simulation.get("expected_delay", 2),
    }


def compute_score(metrics):
    return 0.5 * metrics["distance"] + 0.3 * metrics["risk"] + 0.2 * metrics["delay"]


def validate_route(route_data):
    m = route_data["metrics"]

    if m["delay"] > SLA_LIMIT:
        return False, "SLA violated"

    if m["distance"] > BUDGET_LIMIT:
        return False, "Budget exceeded"

    if m["risk"] > 90:
        return False, "Too risky"

    if route_data["score"] < 0:
        return False, "Invalid score"

    return True, None