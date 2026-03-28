"""
Supply Chain Risk Prediction Platform — Main Entry Point.
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
from utils.guardrails import apply_guardrails
from utils.intelligence import build_intelligence_state
from utils.correlation import detect_correlations

from simulation.ripple_engine import run_simulation
from decision.decision_engine import run_decision_engine

# ✅ STEP 5 IMPORT
from economic.economic_engine import run_economic_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("main")


def run_all_agents() -> dict:
    start_time = time.time()

    agents = [
        WeatherAgent(),
        NewsAgent(),
        TrafficAgent(),
        SupplierAgent(),
        DemandAgent(),
    ]

    results = []

    with ThreadPoolExecutor(max_workers=len(agents)) as executor:
        future_to_agent = {executor.submit(agent.run): agent for agent in agents}

        for future in as_completed(future_to_agent):
            agent = future_to_agent[future]
            try:
                results.append(future.result(timeout=60))
            except Exception:
                results.append({
                    "agent": agent.name,
                    "risk_score": 30,
                    "confidence": 0.2,
                })

    # STEP 1 — Guardrails
    results = [apply_guardrails(r) for r in results]
    final = aggregate_risk(results)

    # STEP 1 — Intelligence
    intelligence = build_intelligence_state(results)
    correlations = detect_correlations(results)

    final["intelligence_state"] = {
        **intelligence,
        "correlations": correlations
    }

    return final


def main():
    logger.info("SUPPLY CHAIN PLATFORM")

    # ---------------- STEP 1 ----------------
    agent_report = run_all_agents()

    # ---------------- STEP 2 ----------------
    simulation_report = run_simulation(
        agent_results=agent_report.get("agents", []),
        route_context={
            "origin": "Mumbai",
            "destination": "Rotterdam",
            "n_simulations": 100,
        },
        intelligence_state=agent_report.get("intelligence_state")
    )

    # ---------------- STEP 4 ----------------
    decision_report = run_decision_engine(
        route_context={
            "source": "Mumbai",
            "destination": "Rotterdam",
        },
        agent_results=agent_report.get("agents", []),
        simulation_output=simulation_report,
        intelligence_state=agent_report.get("intelligence_state"),
        game_theory_output={}  # plug Step 3 here
    )

    # ---------------- STEP 5 ----------------
    economic_report = run_economic_engine(
        decision_output=decision_report,
        intelligence_state=agent_report.get("intelligence_state"),
        simulation_output=simulation_report,
    )

    # ---------------- FINAL OUTPUT ----------------
    combined = {
        "risk_assessment": agent_report,
        "simulation": simulation_report,
        "decision": decision_report,
        "economic": economic_report,   # ✅ NEW
    }

    print(json.dumps(combined, indent=2))
    return combined


if __name__ == "__main__":
    main()