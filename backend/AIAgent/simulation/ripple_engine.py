"""
Ripple Engine — Supply Chain Disruption Propagation Simulator.
"""

import logging
import time
import random
import numpy as np
from datetime import datetime, timezone
from typing import Any

from simulation.graph_model import (
    build_supply_chain_graph,
    apply_agent_risks,
    get_node_order,
)
from simulation.monte_carlo import run_monte_carlo

logger = logging.getLogger(__name__)

DEFAULT_ROUTE_CONTEXT = {
    "origin": "Mumbai, India",
    "destination": "Rotterdam, Netherlands",
    "product": "Electronics",
    "mode": "Ocean Freight",
    "n_simulations": 100,
}

def _classify_impact(score: float) -> str:
    if score >= 60:
        return "CRITICAL"
    elif score >= 35:
        return "HIGH"
    elif score >= 15:
        return "MODERATE"
    else:
        return "LOW"

# ✅ STEP 2 SCENARIOS
SCENARIOS = [
    {"type": "normal", "multiplier": 1.0},
    {"type": "storm", "multiplier": 1.5},
    {"type": "conflict", "multiplier": 2.5},
]

def run_simulation(
    agent_results: list[dict] | None = None,
    route_context: dict | None = None,
    intelligence_state: dict | None = None,  # ✅ NEW
) -> dict[str, Any]:

    start_time = time.perf_counter()
    ctx = {**DEFAULT_ROUTE_CONTEXT, **(route_context or {})}
    n_sims = int(ctx.get("n_simulations", 100))

    # --- Graph ---
    G = build_supply_chain_graph()

    if agent_results:
        G = apply_agent_risks(G, agent_results)

    node_order = get_node_order(G)

    # --- EXISTING Monte Carlo ---
    mc_results = run_monte_carlo(G, node_order, n_simulations=n_sims)

    # =========================================================
    # 🔥 STEP 2 — SCENARIO + MONTE CARLO EXTENSION
    # =========================================================

    decay = 0.85
    MAX_DELAY = 10

    base_risk = intelligence_state["total_risk"] if intelligence_state else 50

    all_delays = []
    scenario_results = []

    for scenario in SCENARIOS:
        delays = []

        for _ in range(n_sims):
            random_factor = random.uniform(0.5, 1.5)

            delay = base_risk * 0.05 * random_factor * scenario["multiplier"]

            total_delay = 0
            current_delay = delay

            for _ in node_order:
                total_delay += current_delay
                current_delay *= decay

            total_delay = min(total_delay, MAX_DELAY)

            delays.append(total_delay)
            all_delays.append(total_delay)

        scenario_results.append({
            "type": scenario["type"],
            "expected_delay": round(np.mean(delays), 2)
        })

    # --- Metrics ---
    expected_delay = float(np.mean(all_delays))
    p95_delay = float(np.percentile(all_delays, 95))
    probability_severe = sum(d > 7 for d in all_delays) / len(all_delays)

    # --- Node impact ---
    node_impacts = {node: 0 for node in node_order}

    for d in all_delays:
        for node in node_order:
            if d > 3:
                node_impacts[node] += 1

    node_impacts = {
        k: round(v / len(all_delays), 2)
        for k, v in node_impacts.items()
    }

    # --- Sensitivity ---
    sensitivity = {
        "traffic+10%": round(base_risk * 1.1 * 0.05, 2),
        "weather+20%": round(base_risk * 1.2 * 0.05, 2),
    }

    # =========================================================

    elapsed = round((time.perf_counter() - start_time) * 1000, 2)

    output = {
        # EXISTING OUTPUT (unchanged)
        "expected_delay": mc_results["expected_delay"],
        "max_delay": mc_results["max_delay"],
        "min_delay": mc_results["min_delay"],
        "std_delay": mc_results["std_delay"],
        "avg_impact_score": mc_results["avg_impact_score"],
        "max_impact_score": mc_results["max_impact_score"],
        "most_critical_node": mc_results["most_critical_node"],
        "avg_nodes_impacted": mc_results["avg_nodes_impacted"],
        "disruption_frequency": mc_results["disruption_frequency"],
        "impact_level": _classify_impact(mc_results["avg_impact_score"]),
        "simulation_runs": n_sims,

        # ✅ NEW STEP 2 OUTPUT
        "scenarios": scenario_results,
        "scenario_expected_delay": round(expected_delay, 2),
        "p95_delay": round(p95_delay, 2),
        "probability_severe": round(probability_severe, 2),
        "sensitivity": sensitivity,
        "node_impacts": node_impacts,

        # Metadata
        "execution_time_ms": elapsed,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    return output