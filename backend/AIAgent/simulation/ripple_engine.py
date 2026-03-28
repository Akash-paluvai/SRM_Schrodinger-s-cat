"""
Ripple Engine — Supply Chain Disruption Propagation Simulator.

Public API:
    run_simulation(agent_results, route_context) → dict

Pipeline:
    1. Build supply chain directed graph
    2. Apply live agent risk scores to graph nodes
    3. Run Monte Carlo propagation (N=100 by default)
    4. Return structured impact summary
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any

from simulation.graph_model import (
    build_supply_chain_graph,
    apply_agent_risks,
    get_node_order,
)
from simulation.monte_carlo import run_monte_carlo

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Route context defaults
# ---------------------------------------------------------------------------
DEFAULT_ROUTE_CONTEXT = {
    "origin":       "Mumbai, India",
    "destination":  "Rotterdam, Netherlands",
    "product":      "Electronics",
    "mode":         "Ocean Freight",
    "n_simulations": 100,
}


# ---------------------------------------------------------------------------
# Risk level classifier
# ---------------------------------------------------------------------------
def _classify_impact(score: float) -> str:
    if score >= 60:
        return "CRITICAL"
    elif score >= 35:
        return "HIGH"
    elif score >= 15:
        return "MODERATE"
    else:
        return "LOW"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def run_simulation(
    agent_results: list[dict] | None = None,
    route_context: dict | None = None,
) -> dict[str, Any]:
    """
    Execute the full Ripple Engine simulation pipeline.

    Args:
        agent_results: List of agent output dicts (from the multi-agent system).
                       If None, uses default node risks from the graph model.
        route_context: Optional dict with route metadata and simulation config.
                       Supported keys: origin, destination, product, mode, n_simulations.

    Returns:
        Structured impact report dict.
    """
    start_time = time.perf_counter()

    # Merge context with defaults
    ctx = {**DEFAULT_ROUTE_CONTEXT, **(route_context or {})}
    n_sims = int(ctx.get("n_simulations", 100))

    logger.info("=" * 60)
    logger.info("  RIPPLE ENGINE — SUPPLY CHAIN SIMULATION")
    logger.info(f"  Route: {ctx['origin']} → {ctx['destination']}")
    logger.info(f"  Product: {ctx['product']} | Mode: {ctx['mode']}")
    logger.info(f"  Simulations: {n_sims}")
    logger.info("=" * 60)

    # --- 1. Build graph ---
    G = build_supply_chain_graph()
    logger.info(
        f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges"
    )

    # --- 2. Apply agent risks ---
    if agent_results:
        G = apply_agent_risks(G, agent_results)
        logger.info(
            f"Applied risks from {len(agent_results)} agents: "
            f"{[r.get('agent') for r in agent_results]}"
        )

        # Log per-node risks after mapping
        for node in G.nodes:
            r = G.nodes[node].get("risk", 0)
            logger.info(f"  Node [{node}]: risk={r:.4f}")
    else:
        logger.warning("No agent results provided — using default graph risks")

    # --- 3. Get topological node order ---
    node_order = get_node_order(G)
    logger.info(f"Propagation order: {' → '.join(node_order)}")

    # --- 4. Run Monte Carlo ---
    mc_results = run_monte_carlo(G, node_order, n_simulations=n_sims)

    # --- 5. Build output ---
    elapsed = round((time.perf_counter() - start_time) * 1000, 2)  # ms

    # Compute risk amplification: ratio of simulated delay to base graph delay
    base_total_delay = sum(
        G.nodes[n].get("base_delay", 0) for n in G.nodes
    )
    risk_amplification = round(
        mc_results["expected_delay"] / base_total_delay
        if base_total_delay > 0 else 1.0,
        3,
    )

    output = {
        # Core simulation outputs
        "expected_delay":       mc_results["expected_delay"],
        "max_delay":            mc_results["max_delay"],
        "min_delay":            mc_results["min_delay"],
        "std_delay":            mc_results["std_delay"],
        "avg_impact_score":     mc_results["avg_impact_score"],
        "max_impact_score":     mc_results["max_impact_score"],
        "risk_amplification":   risk_amplification,
        "most_critical_node":   mc_results["most_critical_node"],
        "avg_nodes_impacted":   mc_results["avg_nodes_impacted"],
        "disruption_frequency": mc_results["disruption_frequency"],
        "impact_level":         _classify_impact(mc_results["avg_impact_score"]),
        "simulation_runs":      n_sims,

        # Route metadata
        "route": {
            "origin":      ctx["origin"],
            "destination": ctx["destination"],
            "product":     ctx["product"],
            "mode":        ctx["mode"],
        },

        # Graph snapshot
        "graph": {
            "nodes": [
                {
                    "id":         node,
                    "label":      G.nodes[node].get("label", node),
                    "risk":       round(G.nodes[node].get("risk", 0), 4),
                    "base_delay": G.nodes[node].get("base_delay", 0),
                    "capacity":   G.nodes[node].get("capacity", 1.0),
                }
                for node in node_order
            ],
            "edges": [
                {"from": u, "to": v}
                for u, v in G.edges
            ],
        },

        # Execution metadata
        "execution_time_ms": elapsed,
        "timestamp":         datetime.now(timezone.utc).isoformat(),
    }

    logger.info(f"Ripple Engine complete in {elapsed}ms")
    logger.info(
        f"  Expected delay : {output['expected_delay']} days"
    )
    logger.info(
        f"  Risk amplification: {output['risk_amplification']}x"
    )
    logger.info(
        f"  Avg impact score: {output['avg_impact_score']} "
        f"({output['impact_level']})"
    )
    logger.info(
        f"  Most critical node: {output['most_critical_node']}"
    )

    return output
