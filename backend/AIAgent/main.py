"""
Supply Chain Risk Prediction Platform — Main Entry Point.

Pipeline:
    1. Run all 5 agents in parallel (ThreadPoolExecutor)
    2. Aggregate weighted risk scores
    3. Feed agent results into the Ripple Engine
    4. Output: per-agent risks + final score + simulation report
"""

import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

from agents.weather_agent import WeatherAgent
from agents.news_agent import NewsAgent
from agents.traffic_agent import TrafficAgent
from agents.supplier_agent import SupplierAgent
from agents.demand_agent import DemandAgent
from utils.risk_utils import aggregate_risk
from simulation.ripple_engine import run_simulation
from decision.decision_engine import run_decision_engine

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("main")


# ---------------------------------------------------------------------------
# Agent execution
# ---------------------------------------------------------------------------
def run_all_agents() -> dict:
    """
    Initialize all agents, execute in parallel, aggregate results.

    Returns:
        Final risk assessment dict with per-agent results and aggregated score.
    """
    start_time = time.time()

    agents = [
        WeatherAgent(),
        NewsAgent(),
        TrafficAgent(),
        SupplierAgent(),
        DemandAgent(),
    ]

    logger.info(f"Initialized {len(agents)} agents: {[a.name for a in agents]}")

    results: list[dict] = []

    with ThreadPoolExecutor(max_workers=len(agents)) as executor:
        future_to_agent = {executor.submit(agent.run): agent for agent in agents}

        for future in as_completed(future_to_agent):
            agent = future_to_agent[future]
            try:
                result = future.result(timeout=60)
                results.append(result)
            except Exception as exc:
                logger.error(f"Agent [{agent.name}] raised: {exc}")
                results.append({
                    "agent":      agent.name,
                    "risk_score": 30,
                    "reason":     f"Execution failed: {exc}",
                    "confidence": 0.2,
                    "timestamp":  datetime.now(timezone.utc).isoformat(),
                })

    results.sort(key=lambda r: r.get("agent", ""))

    logger.info("=" * 60)
    logger.info("RISK AGGREGATION")
    logger.info("=" * 60)
    final = aggregate_risk(results)

    elapsed = round(time.time() - start_time, 2)
    final["execution_time_seconds"] = elapsed
    logger.info(f"Agent phase completed in {elapsed}s")
    return final


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    """Full pipeline: agents → aggregation → ripple simulation → report."""
    logger.info("=" * 60)
    logger.info("  SUPPLY CHAIN RISK PREDICTION PLATFORM")
    logger.info("=" * 60)

    # --- Phase 1: Multi-agent risk scoring ---
    agent_report = run_all_agents()

    # --- Phase 2: Ripple Engine simulation ---
    logger.info("=" * 60)
    logger.info("  RIPPLE ENGINE — DISRUPTION SIMULATION")
    logger.info("=" * 60)

    route_context = {
        "origin":        "Mumbai, India",
        "destination":   "Rotterdam, Netherlands",
        "product":       "Electronics",
        "mode":          "Ocean Freight",
        "n_simulations": 100,
    }

    simulation_report = run_simulation(
        agent_results=agent_report.get("agents", []),
        route_context=route_context,
    )

    # --- Phase 3: Decision Engine (route optimisation) ---
    logger.info("=" * 60)
    logger.info("  DECISION ENGINE — ROUTE OPTIMISATION")
    logger.info("=" * 60)

    decision_context = {
        "source":      "Mumbai",
        "destination": "Rotterdam",
        "method":      "dijkstra",
    }

    decision_report = run_decision_engine(
        route_context=decision_context,
        agent_results=agent_report.get("agents", []),
        simulation_output=simulation_report,
    )

    # --- Phase 4: Combined output ---
    combined = {
        "risk_assessment": agent_report,
        "simulation":      simulation_report,
        "decision":        decision_report,
    }

    print("\n" + "=" * 60)
    print("  FINAL PLATFORM OUTPUT (3 Phases)")
    print("=" * 60)
    print(json.dumps(combined, indent=2))
    print("=" * 60)

    return combined


if __name__ == "__main__":
    main()
