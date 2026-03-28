"""
Decision Engine — Public API.

Orchestrates:
  1. Route graph construction (with live agent risks + simulation delays)
  2. Cost weight computation
  3. Route optimisation (Dijkstra by default, extensible to RL / Game Theory)
  4. Structured output

Entry point:
    run_decision_engine(route_context, agent_results, simulation_output, method)
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any

from decision.route_graph import build_graph, DEFAULT_ROUTE_OPTIONS
from decision.cost_function import CostConfig, DEFAULT_COST_CONFIG
from decision.optimizer import Optimizer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default route context
# ---------------------------------------------------------------------------
DEFAULT_ROUTE_CONTEXT: dict[str, Any] = {
    "source":      "Mumbai",
    "destination": "Rotterdam",
    "method":      "dijkstra",
}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def run_decision_engine(
    route_context:     dict[str, Any]  | None = None,
    agent_results:     list[dict]      | None = None,
    simulation_output: dict[str, Any]  | None = None,
    method:            str             = "dijkstra",
    cost_config:       CostConfig      = DEFAULT_COST_CONFIG,
    route_options:     list[tuple]     | None = None,
) -> dict[str, Any]:
    """
    Run the full Decision Engine pipeline.

    Args:
        route_context:     Dict with 'source', 'destination', optional 'method'.
                           Overrides the method arg if 'method' key is present.
        agent_results:     Agent risk outputs from the multi-agent system.
                           Each item: {'agent': str, 'risk_score': float, ...}
        simulation_output: Ripple Engine output dict containing 'expected_delay'.
        method:            Optimisation strategy: 'dijkstra'|'astar'|'rl'|'game_theory'.
        cost_config:       Custom CostConfig to override default weights.
        route_options:     Custom (source, dest, distance_km) edge list.
                           Defaults to pre-defined global shipping lanes.

    Returns:
        Structured dict with best route, metrics, and execution metadata.
    """
    start = time.perf_counter()

    # --- Merge context ---
    ctx = {**DEFAULT_ROUTE_CONTEXT, **(route_context or {})}
    source      = ctx.get("source", "Mumbai")
    destination = ctx.get("destination", "Rotterdam")
    method      = ctx.get("method", method)   # context overrides arg

    logger.info("=" * 60)
    logger.info("  DECISION ENGINE")
    logger.info(f"  Route  : {source} → {destination}")
    logger.info(f"  Method : {method.upper()}")
    logger.info("=" * 60)

    # --- 1. Build weighted graph ---
    G = build_graph(
        route_options=route_options or DEFAULT_ROUTE_OPTIONS,
        agent_results=agent_results,
        simulation_output=simulation_output,
        config=cost_config,
    )

    # Log the graph snapshot
    logger.info(f"Graph nodes: {list(G.nodes)}")
    logger.info(
        f"Cost weights: dist={cost_config.distance_weight}, "
        f"risk={cost_config.risk_weight}, delay={cost_config.delay_weight}"
    )

    # --- 2. Run optimiser ---
    optimizer = Optimizer(G)
    result = optimizer.run(source, destination, method=method)

    # --- 3. Enrich output ---
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

    output = {
        **result,
        "route_context": {
            "source":      source,
            "destination": destination,
            "method":      method,
        },
        "cost_config": {
            "distance_weight": cost_config.distance_weight,
            "risk_weight":     cost_config.risk_weight,
            "delay_weight":    cost_config.delay_weight,
        },
        "graph_summary": {
            "nodes": list(G.nodes),
            "edge_count": G.number_of_edges(),
        },
        "execution_time_ms": elapsed_ms,
        "timestamp":         datetime.now(timezone.utc).isoformat(),
    }

    # --- 4. Log summary ---
    if result.get("best_route"):
        logger.info(
            f"Best route : {' → '.join(result['best_route'])}"
        )
        logger.info(f"Score      : {result.get('final_score')}")
        logger.info(f"Distance   : {result.get('total_distance')} km")
        logger.info(f"Risk       : {result.get('total_risk')}")
        logger.info(f"Delay      : {result.get('total_delay')}")
    else:
        logger.warning(f"No route found or stub method used: {method}")

    logger.info(f"Decision Engine completed in {elapsed_ms}ms")
    return output
