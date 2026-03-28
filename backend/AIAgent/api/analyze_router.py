"""
api/analyze_router.py
─────────────────────
Single POST endpoint that runs the full 5-step agentic AI pipeline
and returns structured results for the Intelligence + Simulation dashboards.

POST /api/v1/analyze
Body (all optional — defaults to Mumbai → Rotterdam):
  {
    "source": "Mumbai",
    "destination": "Rotterdam",
    "stops": ["Dubai"],
    "shipmentType": "Electronics",
    "transportMode": "Sea",
    "disruptionScenario": "conflict"   // optional override
  }

Response: full pipeline output (steps 1-5) + db_insights blob
"""
from __future__ import annotations

import logging
import sys
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# ── Make AIAgent importable ───────────────────────────────────────────────────
_HERE = Path(__file__).parent.parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from utils.risk_utils   import aggregate_risk
from utils.guardrails   import apply_guardrails
from utils.intelligence import build_intelligence_state
from utils.correlation  import detect_correlations

from simulation.ripple_engine         import run_simulation
from decision.route_graph             import build_graph, DEFAULT_ROUTE_OPTIONS
from decision.cost_function           import DEFAULT_COST_CONFIG
from decision.game_theory.game_solver import run_game_theory_engine
from decision.decision_engine         import run_decision_engine
from economic.economic_engine         import run_economic_engine

from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger("analyze_router")

router = APIRouter()


# ── Request schema ─────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    source:              str = "Mumbai"
    destination:         str = "Rotterdam"
    stops:               List[str] = []
    shipment_type:       Optional[str] = "Electronics"
    transport_mode:      Optional[str] = "Sea"
    disruption_scenario: Optional[str] = None   # override for simulation


# ── Bridge helper (same as main.py) ───────────────────────────────────────────

def _bridge_simulation(sim: dict) -> dict:
    bridged = dict(sim)
    if "worst_case_delay" not in bridged:
        bridged["worst_case_delay"] = bridged.get(
            "p95_delay", bridged.get("expected_delay", 10.0) * 2.5
        )
    if "disruption_probability" not in bridged:
        bridged["disruption_probability"] = float(
            bridged.get("probability_severe", 0.3)
        )
    if "risk_level" not in bridged:
        bridged["risk_level"] = bridged.get("impact_level", "MODERATE")
    return bridged


# ── Run agents (same as main.py but async-friendly via threadpool) ─────────────

def _run_agents() -> dict:
    # Lazy imports — heavy ML/LLM packages (transformers, langchain) load here,
    # not at module import time, so the router always registers successfully.
    from agents.weather_agent  import WeatherAgent
    from agents.news_agent     import NewsAgent
    from agents.traffic_agent  import TrafficAgent
    from agents.supplier_agent import SupplierAgent
    from agents.demand_agent   import DemandAgent

    agents = [WeatherAgent(), NewsAgent(), TrafficAgent(), SupplierAgent(), DemandAgent()]
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=len(agents)) as executor:
        future_to_agent = {executor.submit(agent.run): agent for agent in agents}
        for future in as_completed(future_to_agent):
            agent = future_to_agent[future]
            try:
                results.append(future.result(timeout=60))
            except Exception as exc:
                logger.error("Agent [%s] failed: %s", agent.name, exc)
                results.append({
                    "agent": agent.name, "risk_score": 30,
                    "confidence": 0.2,
                    "reason": f"Agent error — fallback risk",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
    results.sort(key=lambda r: r.get("agent", ""))
    results   = [apply_guardrails(r) for r in results]
    final     = aggregate_risk(results)
    intel     = build_intelligence_state(results)
    corr      = detect_correlations(results)
    final["intelligence_state"] = {**intel, "correlations": corr}
    return final


# ── Main endpoint ──────────────────────────────────────────────────────────────

@router.post(
    "/analyze",
    summary="Run full 5-step agentic AI pipeline for a route",
)
async def analyze_route(payload: AnalyzeRequest) -> Dict[str, Any]:
    """
    Runs all 5 pipeline steps in sequence and returns the combined output.
    Also returns a flattened `db_insights` dict suitable for writing to
    the shipment document's `insights` field.
    """
    import asyncio
    from fastapi.concurrency import run_in_threadpool

    logger.info("ANALYZE | %s → %s", payload.source, payload.destination)

    try:
        # Step 1 — agents (CPU+IO bound — run in threadpool to not block event loop)
        agent_report = await run_in_threadpool(_run_agents)
        intel        = agent_report.get("intelligence_state", {})

        # Step 2 — simulation
        simulation_report = await run_in_threadpool(
            run_simulation,
            agent_report.get("agents", []),
            {
                "origin":        payload.source,
                "destination":   payload.destination,
                "product":       payload.shipment_type or "Electronics",
                "mode":          payload.transport_mode or "Sea",
                "n_simulations": 100,
            },
            intel,
        )
        simulation_report = _bridge_simulation(simulation_report)

        # Step 3 — game theory
        G = build_graph(
            route_options=DEFAULT_ROUTE_OPTIONS,
            agent_results=agent_report.get("agents", []),
            simulation_output=simulation_report,
            config=DEFAULT_COST_CONFIG,
        )
        game_theory_report = await run_in_threadpool(
            run_game_theory_engine,
            G,
            payload.source,
            payload.destination,
            simulation_report,
            intel,
        )

        # Step 4 — decision
        decision_report = await run_in_threadpool(
            run_decision_engine,
            {"source": payload.source, "destination": payload.destination},
            agent_report.get("agents", []),
            simulation_report,
            "dijkstra",
            DEFAULT_COST_CONFIG,
            None,
            intel,
            game_theory_report,
        )

        # Step 5 — economic
        economic_report = await run_in_threadpool(
            run_economic_engine,
            decision_report,
            intel,
            simulation_report,
        )

    except Exception as exc:
        logger.exception("Pipeline error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}")

    # ── Build db_insights blob ────────────────────────────────────────────────
    agents_clean = []
    for a in agent_report.get("agents", []):
        agents_clean.append({
            "agent":      a.get("agent"),
            "risk_score": a.get("risk_score"),
            "confidence": a.get("confidence"),
            "reason":     a.get("reason", ""),
        })

    db_insights = {
        "type": "agentic_pipeline",
        "data": {
            "run_at":          datetime.now(timezone.utc).isoformat(),
            "source":          payload.source,
            "destination":     payload.destination,
            "final_risk":      agent_report.get("final_risk"),
            "risk_level":      agent_report.get("risk_level"),
            "dominant_risk":   intel.get("dominant_risk"),
            "agents":          agents_clean,
            "expected_delay":  simulation_report.get("expected_delay"),
            "p95_delay":       simulation_report.get("p95_delay"),
            "optimal_route":   decision_report.get("best_route", []),
            "economic_cost":   economic_report.get("recommended_route", {}).get("adjusted_cost"),
        },
    }

    return {
        "step1_risk_assessment": agent_report,
        "step2_simulation":      simulation_report,
        "step3_game_theory":     game_theory_report,
        "step4_decision":        decision_report,
        "step5_economic":        economic_report,
        "db_insights":           db_insights,
        "meta": {
            "source":      payload.source,
            "destination": payload.destination,
            "timestamp":   datetime.now(timezone.utc).isoformat(),
        },
    }
