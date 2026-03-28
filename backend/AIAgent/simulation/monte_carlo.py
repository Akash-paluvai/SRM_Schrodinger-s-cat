"""
Monte Carlo Simulation Engine.

Runs N independent disruption scenarios across the supply chain graph.
Each run:
  1. Randomly selects a disruption origin node (weighted by node risk).
  2. Generates a random delay at that node.
  3. Propagates the delay downstream with decay.
  4. Computes per-run impact metrics.

Aggregates results into a summary dict.
"""

import logging
import random
from collections import Counter
from typing import Any

import numpy as np
import networkx as nx

from simulation.graph_model import PROPAGATION_DECAY, PROPAGATION_FACTOR

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Impact scoring
# ---------------------------------------------------------------------------
def _compute_impact(total_delay: float, impacted_count: int) -> float:
    """
    Business impact formula.

    impact = delay_score * 0.6 + risk_score * 0.4
    where:
        delay_score = total_delay (days)
        risk_score  = impacted_node_count * 10
    """
    delay_score = total_delay
    risk_score = impacted_count * 10
    return round(delay_score * 0.6 + risk_score * 0.4, 4)


# ---------------------------------------------------------------------------
# Single simulation run
# ---------------------------------------------------------------------------
def _run_single(
    G: nx.DiGraph,
    node_order: list[str],
    rng: random.Random,
) -> dict[str, Any]:
    """
    Execute one Monte Carlo scenario.

    Args:
        G: The supply chain graph (not mutated).
        node_order: Topological order of nodes.
        rng: Seeded Random instance for reproducibility within a run.

    Returns:
        Dict with: total_delay, impacted_nodes, severity_score.
    """
    # --- Select disruption origin weighted by node risk ---
    nodes = list(G.nodes)
    weights = [G.nodes[n].get("risk", 0.1) for n in nodes]
    # Avoid zero-weight edge cases
    weights = [max(w, 0.01) for w in weights]

    disruption_node = rng.choices(nodes, weights=weights, k=1)[0]

    # --- Generate initial delay at disruption node ---
    node_risk = G.nodes[disruption_node].get("risk", 0.2)
    base_delay = G.nodes[disruption_node].get("base_delay", 1.0)
    disruption_delay = base_delay + rng.uniform(0, node_risk * 2)

    # --- Propagate through downstream nodes ---
    # Track cumulative delay per node
    node_delays: dict[str, float] = {n: 0.0 for n in nodes}
    node_delays[disruption_node] = disruption_delay

    impacted_nodes: set[str] = {disruption_node}
    total_delay = disruption_delay

    for node in node_order:
        incoming_delay = node_delays[node]
        if incoming_delay <= 0:
            continue

        for successor in G.successors(node):
            prop_factor = G.edges[node, successor].get(
                "propagation_factor", PROPAGATION_FACTOR
            )
            # Propagated delay with decay
            propagated = incoming_delay * prop_factor * PROPAGATION_DECAY
            additional_base = G.nodes[successor].get("base_delay", 0.0)

            downstream_delay = propagated + rng.uniform(0, additional_base * 0.3)
            node_delays[successor] += downstream_delay

            if downstream_delay > 0.01:
                impacted_nodes.add(successor)
                total_delay += downstream_delay

    severity_score = _compute_impact(total_delay, len(impacted_nodes))

    return {
        "disruption_node": disruption_node,
        "total_delay": round(total_delay, 4),
        "impacted_nodes": list(impacted_nodes),
        "impacted_count": len(impacted_nodes),
        "severity_score": severity_score,
    }


# ---------------------------------------------------------------------------
# Monte Carlo orchestrator
# ---------------------------------------------------------------------------
def run_monte_carlo(
    G: nx.DiGraph,
    node_order: list[str],
    n_simulations: int = 100,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Run N Monte Carlo simulations and aggregate results.

    Args:
        G: The supply chain graph with agent risks applied.
        node_order: Topological node order.
        n_simulations: Number of simulation runs.
        seed: Optional random seed for reproducibility.

    Returns:
        Aggregated simulation statistics.
    """
    rng = random.Random(seed)
    sim_results: list[dict] = []

    logger.info(f"Running {n_simulations} Monte Carlo simulations...")

    for i in range(n_simulations):
        result = _run_single(G, node_order, rng)
        sim_results.append(result)

    # --- Aggregate metrics ---
    delays = np.array([r["total_delay"] for r in sim_results])
    impacts = np.array([r["severity_score"] for r in sim_results])

    # Most disrupted node across all runs
    disruption_counter: Counter = Counter(
        r["disruption_node"] for r in sim_results
    )
    most_critical_node = disruption_counter.most_common(1)[0][0]

    # Average number of nodes impacted per run
    avg_impacted = np.mean([r["impacted_count"] for r in sim_results])

    summary = {
        "expected_delay":       round(float(np.mean(delays)), 3),
        "max_delay":            round(float(np.max(delays)), 3),
        "min_delay":            round(float(np.min(delays)), 3),
        "std_delay":            round(float(np.std(delays)), 3),
        "avg_impact_score":     round(float(np.mean(impacts)), 3),
        "max_impact_score":     round(float(np.max(impacts)), 3),
        "most_critical_node":   most_critical_node,
        "avg_nodes_impacted":   round(float(avg_impacted), 2),
        "disruption_frequency": dict(disruption_counter),
        "simulation_runs":      n_simulations,
    }

    logger.info(
        f"Simulation complete — "
        f"expected_delay={summary['expected_delay']}d, "
        f"avg_impact={summary['avg_impact_score']}, "
        f"critical_node={summary['most_critical_node']}"
    )
    return summary
