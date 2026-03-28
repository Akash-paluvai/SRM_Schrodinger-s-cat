"""
Decision Engine — Enhanced with Strategic Layer (Step 4)
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any

from decision.route_graph import build_graph, DEFAULT_ROUTE_OPTIONS
from decision.cost_function import CostConfig, DEFAULT_COST_CONFIG
from decision.optimizer import Optimizer

# ✅ NEW
from decision.decision_utils import (
    compute_route_metrics,
    compute_score,
    validate_route,
)

logger = logging.getLogger(__name__)

DEFAULT_ROUTE_CONTEXT: dict[str, Any] = {
    "source": "Mumbai",
    "destination": "Rotterdam",
    "method": "dijkstra",
}


def run_decision_engine(
    route_context: dict[str, Any] | None = None,
    agent_results: list[dict] | None = None,
    simulation_output: dict[str, Any] | None = None,
    method: str = "dijkstra",
    cost_config: CostConfig = DEFAULT_COST_CONFIG,
    route_options: list[tuple] | None = None,

    # ✅ STEP 4 INPUTS
    intelligence_state: dict | None = None,
    game_theory_output: dict | None = None,
) -> dict[str, Any]:

    start = time.perf_counter()

    ctx = {**DEFAULT_ROUTE_CONTEXT, **(route_context or {})}
    source = ctx.get("source", "Mumbai")
    destination = ctx.get("destination", "Rotterdam")
    method = ctx.get("method", method)

    logger.info("=" * 60)
    logger.info("  DECISION ENGINE")
    logger.info(f"  Route  : {source} → {destination}")
    logger.info("=" * 60)

    # ---------------- EXISTING ----------------
    G = build_graph(
        route_options=route_options or DEFAULT_ROUTE_OPTIONS,
        agent_results=agent_results,
        simulation_output=simulation_output,
        config=cost_config,
    )

    optimizer = Optimizer(G)
    base_result = optimizer.run(source, destination, method=method)

    # ---------------- STEP 4 ----------------
    intelligence = intelligence_state or {}
    simulation = simulation_output or {}
    game = game_theory_output or {}

    routes = {
        "robust": game.get("robust_route"),
        "expected": game.get("expected_optimal_route"),
        "risk_adjusted": game.get("risk_adjusted_route"),
    }

    routes = {k: v for k, v in routes.items() if v is not None}

    route_table = {}

    for name, route in routes.items():
        metrics = compute_route_metrics(route, intelligence, simulation)
        score = compute_score(metrics)

        route_table[name] = {
            "route": route,
            "metrics": metrics,
            "score": score,
        }

    # -------- Guardrails --------
    valid_routes = {}
    rejected_routes = []

    for name, data in route_table.items():
        is_valid, reason = validate_route(data)

        if is_valid:
            valid_routes[name] = data
        else:
            rejected_routes.append({
                "route": name,
                "reason": reason
            })

    # -------- Strategy Selection --------
    if valid_routes:
        safe_route = min(valid_routes.values(), key=lambda x: x["metrics"]["risk"])
        cost_optimal = min(valid_routes.values(), key=lambda x: x["metrics"]["distance"])
        balanced = min(valid_routes.values(), key=lambda x: x["score"])
    else:
        safe_route = cost_optimal = balanced = None

    robust = routes.get("robust")

    # -------- Confidence --------
    volatility = intelligence.get("volatility", 0.2)
    base_conf = game.get("confidence", 0.8)
    confidence = round(base_conf * (1 - volatility), 2)

    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

    return {
        **base_result,

        # ✅ STEP 4 OUTPUT
        "strategies": {
            "safe_route": safe_route,
            "cost_optimal": cost_optimal,
            "balanced_route": balanced,
            "robust_route": robust,
        },
        "confidence": confidence,
        "rejected_routes": rejected_routes,
        "reasoning": "Balanced route minimizes combined cost, risk, and delay",

        "execution_time_ms": elapsed_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }