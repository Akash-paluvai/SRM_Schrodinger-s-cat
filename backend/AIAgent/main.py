"""
Supply Chain Risk Prediction Platform — Main Entry Point.

Steps 1-5 Pipeline:
  Step 1 — Multi-Agent Risk Assessment
  Step 2 — Ripple Engine Simulation
  Step 3 — Game Theory Route Selection
  Step 4 — Decision Engine
  Step 5 — Economic Impact Analysis

Outputs:
  - Console : human-readable step-by-step summary
  - File    : reports/full_report_<timestamp>.json  (complete data)
  - Log     : reports/pipeline.log                 (all logging, UTF-8)
"""

import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from agents.weather_agent  import WeatherAgent
from agents.news_agent     import NewsAgent
from agents.traffic_agent  import TrafficAgent
from agents.supplier_agent import SupplierAgent
from agents.demand_agent   import DemandAgent

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

# ---------------------------------------------------------------------------
# Reports directory — created once on startup
# ---------------------------------------------------------------------------
REPORTS_DIR = Path(__file__).parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# Logging — writes to console AND a UTF-8 log file
# ---------------------------------------------------------------------------
_log_file = REPORTS_DIR / "pipeline.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(_log_file, mode="w", encoding="utf-8"),
    ],
)
logger = logging.getLogger("main")


# ---------------------------------------------------------------------------
# Simulation bridge — aligns Ripple Engine field names to Game Theory contract
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Step 1 — agents
# ---------------------------------------------------------------------------
def run_all_agents() -> dict:
    agents = [WeatherAgent(), NewsAgent(), TrafficAgent(), SupplierAgent(), DemandAgent()]
    results: list[dict] = []

    with ThreadPoolExecutor(max_workers=len(agents)) as executor:
        future_to_agent = {executor.submit(agent.run): agent for agent in agents}
        for future in as_completed(future_to_agent):
            agent = future_to_agent[future]
            try:
                results.append(future.result(timeout=60))
            except Exception as exc:
                logger.error(f"Agent [{agent.name}] failed: {exc}")
                results.append({
                    "agent": agent.name, "risk_score": 30,
                    "confidence": 0.2,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    results.sort(key=lambda r: r.get("agent", ""))
    results      = [apply_guardrails(r) for r in results]
    final        = aggregate_risk(results)
    intelligence = build_intelligence_state(results)
    correlations = detect_correlations(results)
    final["intelligence_state"] = {**intelligence, "correlations": correlations}
    return final


# ---------------------------------------------------------------------------
# Console summary printers
# ---------------------------------------------------------------------------
def _sep(w=60): print("=" * w)

def _print_step1(r: dict):
    _sep(); print("  STEP 1 — RISK ASSESSMENT"); _sep()
    for a in r.get("agents", []):
        bar = "█" * int(a.get("risk_score", 0) / 5)
        print(f"  {a['agent'].upper():<10} risk={a.get('risk_score',0):5.1f}"
              f"  conf={a.get('confidence',0):.2f}  {bar}")
    intel = r.get("intelligence_state", {})
    print(f"\n  Final risk  : {r['final_risk']}  [{r['risk_level']}]")
    print(f"  Dominant    : {intel.get('dominant_risk','?')}")
    print(f"  Trend       : {intel.get('trend', 0):+.2f}")

def _print_step2(r: dict):
    _sep(); print("  STEP 2 — SIMULATION"); _sep()
    print(f"  Expected delay   : {r.get('expected_delay','?')} days")
    print(f"  Worst-case (p95) : {r.get('worst_case_delay','?')} days")
    print(f"  Disruption prob  : {r.get('disruption_probability', 0):.1%}")
    print(f"  Impact level     : {r.get('risk_level','?')}")
    print(f"  Critical node    : {r.get('most_critical_node','?')}")
    print(f"\n  Scenarios:")
    for s in r.get("scenarios", []):
        print(f"    {s['type'].upper():<12} → {s['expected_delay']} days")

def _print_step3(r: dict):
    _sep(); print("  STEP 3 — GAME THEORY"); _sep()
    if r.get("error"):
        print(f"  ERROR: {r['error']}"); return
    print(f"  Minimax route    : {' → '.join(r.get('robust_route', []))}")
    print(f"  Expected optimal : {' → '.join(r.get('expected_optimal_route', []))}")
    print(f"  Risk-adjusted    : {' → '.join(r.get('risk_adjusted_route', []))}")
    print(f"  Confidence       : {r.get('confidence', 0):.1%}")
    print(f"  Dominated removed: {r.get('dominated_removed', [])}")
    print(f"\n  Strategy scores (top routes):")
    for route, s in list(r.get("strategy_scores", {}).items())[:3]:
        short = (route.replace("Mumbai","MUM").replace("Rotterdam","RTM")
                      .replace("Suez Canal","SUZ").replace("Singapore","SIN")
                      .replace("Cape of Good Hope","CGH").replace("Dubai","DXB"))
        print(f"    {short}")
        print(f"      worst={s['worst_case_cost']:.4f}  "
              f"expected={s['expected_cost']:.4f}  "
              f"risk-adj={s['risk_adjusted_score']:.4f}")

def _print_step4(r: dict):
    _sep(); print("  STEP 4 — DECISION ENGINE  (QUBO + Dijkstra)"); _sep()
    print(f"  Base route (dijkstra): {' → '.join(r.get('best_route', []))}")
    print(f"  Confidence           : {r.get('confidence', 0):.1%}")

    qr = r.get("qubo_result", {})
    if qr and not qr.get("error"):
        print(f"\n  ── QUBO Optimization ──────────────────────────────────")
        print(f"  Optimal route        : {qr.get('optimal_route_label', '?')}")
        print(f"  QUBO energy          : {qr.get('qubo_energy', '?')}")
        print(f"  Solver               : {qr.get('solver_used', '?')}")
        print(f"  SA verification      : agrees={qr['sa_verification'].get('agrees','?')}")
        print(f"  Routes evaluated     : {qr.get('n_routes_evaluated', '?')}")
        print(f"\n  Route energies (ranked):")
        for row in qr.get("route_energies", [])[:5]:
            tag = " ← SELECTED" if row.get("selected") else ""
            print(f"    #{row['rank']}  {row['route']}")
            print(f"         energy={row['qubo_energy']:.4f}  "
                  f"dist={row['distance_km']:.0f}km  "
                  f"risk={row['risk_score']:.1f}  "
                  f"delay={row['delay_days']:.1f}d{tag}")
        print(f"\n  Constraints:")
        for c in qr.get("constraints", []):
            viol = c.get("violating_routes", [])
            status = f"VIOLATED ({viol})" if viol else "OK"
            print(f"    {c['id']} {c['name']:<22} : {status}")

    strats = r.get("strategies", {})
    print(f"\n  All strategies:")
    for name, data in strats.items():
        if not data:
            continue
        if isinstance(data, list):
            print(f"  {name:<16} : {' → '.join(data)}")
        elif isinstance(data, dict):
            nodes = data.get("route", [])
            label = ' → '.join(nodes) if isinstance(nodes, list) else str(nodes)
            print(f"  {name:<16} : {label}  (score={data.get('score','?')})")
    if r.get("rejected_routes"):
        print(f"  Rejected           : {[x['route'] for x in r['rejected_routes']]}")

def _print_step5(r: dict):
    _sep(); print("  STEP 5 — ECONOMIC ANALYSIS"); _sep()
    s = r.get("economic_summary", {})
    print(f"  Oil impact       : {s.get('oil_impact_percent', 0):+.1f}%")
    print(f"  Demand impact    : {s.get('demand_impact_percent', 0):+.1f}%")
    print(f"  Total cost rise  : {s.get('total_cost_increase_percent', 0):+.1f}%")
    rec = r.get("recommended_route")
    if rec:
        print(f"  Recommended route: {rec.get('route_id','?')}  "
              f"adj. cost = {rec.get('adjusted_cost','?'):,.2f}")
    if r.get("routes"):
        print(f"\n  All routes:")
        for route in r["routes"]:
            print(f"    {route['route_id']:<16}"
                  f"  base={route['base_cost']:>8,.0f}"
                  f"  adjusted={route['adjusted_cost']:>10,.2f}")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def main():
    run_ts   = datetime.now(timezone.utc)
    run_slug = run_ts.strftime("%Y%m%d_%H%M%S")

    logger.info("=" * 60)
    logger.info("  SUPPLY CHAIN RISK PREDICTION PLATFORM")
    logger.info(f"  Run ID : {run_slug}")
    logger.info("=" * 60)

    # ── Step 1 ────────────────────────────────────────────────────────────────
    logger.info("STEP 1 — Multi-Agent Risk Assessment")
    t = time.perf_counter()
    agent_report = run_all_agents()
    intel = agent_report.get("intelligence_state", {})
    logger.info(f"Step 1 done {time.perf_counter()-t:.1f}s | "
                f"risk={agent_report['final_risk']} [{agent_report['risk_level']}]")

    # ── Step 2 ────────────────────────────────────────────────────────────────
    logger.info("STEP 2 — Ripple Engine Simulation")
    t = time.perf_counter()
    simulation_report = run_simulation(
        agent_results=agent_report.get("agents", []),
        route_context={
            "origin": "Mumbai, India", "destination": "Rotterdam, Netherlands",
            "product": "Electronics", "mode": "Ocean Freight", "n_simulations": 100,
        },
        intelligence_state=intel,
    )
    simulation_report = _bridge_simulation(simulation_report)
    logger.info(f"Step 2 done {time.perf_counter()-t:.1f}s | "
                f"delay={simulation_report.get('expected_delay')}d  "
                f"prob={simulation_report.get('disruption_probability',0):.0%}")

    # ── Step 3 ────────────────────────────────────────────────────────────────
    logger.info("STEP 3 — Game Theory Route Selection")
    t = time.perf_counter()
    G = build_graph(
        route_options=DEFAULT_ROUTE_OPTIONS,
        agent_results=agent_report.get("agents", []),
        simulation_output=simulation_report,
        config=DEFAULT_COST_CONFIG,
    )
    game_theory_report = run_game_theory_engine(
        graph=G,
        source="Mumbai",
        destination="Rotterdam",
        simulation_output=simulation_report,
        intelligence_state=intel,
    )
    logger.info(f"Step 3 done {time.perf_counter()-t:.1f}s | "
                f"robust={game_theory_report.get('robust_route')}  "
                f"conf={game_theory_report.get('confidence')}")

    # ── Step 4 ────────────────────────────────────────────────────────────────
    logger.info("STEP 4 — Decision Engine")
    t = time.perf_counter()
    decision_report = run_decision_engine(
        route_context={"source": "Mumbai", "destination": "Rotterdam"},
        agent_results=agent_report.get("agents", []),
        simulation_output=simulation_report,
        intelligence_state=intel,
        game_theory_output=game_theory_report,
    )
    logger.info(f"Step 4 done {time.perf_counter()-t:.1f}s | "
                f"best={decision_report.get('best_route')}  "
                f"conf={decision_report.get('confidence')}")

    # ── Step 5 ────────────────────────────────────────────────────────────────
    logger.info("STEP 5 — Economic Impact Analysis")
    t = time.perf_counter()
    economic_report = run_economic_engine(
        decision_output=decision_report,
        intelligence_state=intel,
        simulation_output=simulation_report,
    )
    logger.info(f"Step 5 done {time.perf_counter()-t:.1f}s | "
                f"cost_rise={economic_report['economic_summary'].get('total_cost_increase_percent',0):.1f}%")

    # ── Assemble combined output ──────────────────────────────────────────────
    combined = {
        "step1_risk_assessment": agent_report,
        "step2_simulation":      simulation_report,
        "step3_game_theory":     game_theory_report,
        "step4_decision":        decision_report,
        "step5_economic":        economic_report,
        "meta": {
            "run_id":    run_slug,
            "timestamp": run_ts.isoformat(),
        },
    }

    # ── Save full JSON report ─────────────────────────────────────────────────
    report_path = REPORTS_DIR / f"report_{run_slug}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2, default=str)

    # ── Save dedicated Game Theory report ────────────────────────────────────
    gt_report = {
        "run_id":    run_slug,
        "timestamp": run_ts.isoformat(),
        "source":    "Mumbai",
        "destination": "Rotterdam",
        "payoff_matrix":          game_theory_report.get("payoff_matrix", {}),
        "route_costs":            game_theory_report.get("route_costs", {}),
        "scenarios":              game_theory_report.get("scenarios", []),
        "strategy_scores":        game_theory_report.get("strategy_scores", {}),
        "minimax_route":          game_theory_report.get("robust_route", []),
        "expected_optimal_route": game_theory_report.get("expected_optimal_route", []),
        "risk_adjusted_route":    game_theory_report.get("risk_adjusted_route", []),
        "confidence":             game_theory_report.get("confidence", 0.0),
        "dominated_removed":      game_theory_report.get("dominated_removed", []),
        "high_risk_removed":      game_theory_report.get("high_risk_removed", []),
        "lambda_risk":            game_theory_report.get("lambda_risk", 0.5),
        "summary": {
            "total_routes_evaluated": (
                len(game_theory_report.get("strategy_scores", {}))
                + len(game_theory_report.get("dominated_removed", []))
                + len(game_theory_report.get("high_risk_removed", []))
            ),
            "routes_surviving": len(game_theory_report.get("strategy_scores", {})),
            "routes_dominated": len(game_theory_report.get("dominated_removed", [])),
            "routes_high_risk": len(game_theory_report.get("high_risk_removed", [])),
        },
    }
    gt_path = REPORTS_DIR / f"game_theory_{run_slug}.json"
    with open(gt_path, "w", encoding="utf-8") as f:
        json.dump(gt_report, f, indent=2, default=str)

    # ── Save dedicated QUBO report ───────────────────────────────────────────
    qubo_data = decision_report.get("qubo_result", {})
    qubo_report_out = {
        "run_id":    run_slug,
        "timestamp": run_ts.isoformat(),
        "source":    "Mumbai",
        "destination": "Rotterdam",
        "methodology": {
            "name":        "QUBO — Quadratic Unconstrained Binary Optimization",
            "formulation": "minimize x^T Q x  where x ∈ {0,1}^n",
            "solver":      qubo_data.get("solver_used", "exact_enumeration"),
            "description": (
                "Each binary variable x_i represents whether route i is chosen. "
                "The Q matrix encodes both the objective (weighted cost) and all "
                "constraint penalties. The solution x* with minimum energy is the optimal route."
            ),
        },
        "constraints_considered": qubo_data.get("constraints", []),
        "objective_weights":      qubo_data.get("objective_weights", {}),
        "penalty_weights":        qubo_data.get("penalty_weights", {}),
        "thresholds":             qubo_data.get("thresholds", {}),
        "normalisers":            qubo_data.get("normalisers", {}),
        "n_routes_evaluated":     qubo_data.get("n_routes_evaluated", 0),
        "qubo_matrix":            qubo_data.get("qubo_matrix", {}),
        "route_energies":         qubo_data.get("route_energies", []),
        "optimal_route":          qubo_data.get("optimal_route_label", ""),
        "optimal_path":           qubo_data.get("optimal_route", []),
        "qubo_energy":            qubo_data.get("qubo_energy", None),
        "feasible":               qubo_data.get("feasible", True),
        "sa_verification":        qubo_data.get("sa_verification", {}),
        "optimality_report":      qubo_data.get("optimality_report", {}),
    }
    qubo_path = REPORTS_DIR / f"qubo_{run_slug}.json"
    with open(qubo_path, "w", encoding="utf-8") as f:
        json.dump(qubo_report_out, f, indent=2, default=str)

    # ── Save dedicated Economic report ───────────────────────────────────────
    eco_report = {
        "run_id":    run_slug,
        "timestamp": run_ts.isoformat(),
        "routes":    economic_report.get("routes", []),
        "economic_summary":  economic_report.get("economic_summary", {}),
        "recommended_route": economic_report.get("recommended_route", {}),
        "factors_explained": {
            "oil":      "Fuel surcharge multiplier based on current crude oil price index",
            "demand":   "Freight rate inflator driven by demand-supply imbalance from demand agent",
            "currency": "USD/EUR exchange rate adjustment on invoiced cost",
        },
    }
    eco_path = REPORTS_DIR / f"economic_{run_slug}.json"
    with open(eco_path, "w", encoding="utf-8") as f:
        json.dump(eco_report, f, indent=2, default=str)

    # ── Console summaries ─────────────────────────────────────────────────────
    _print_step1(agent_report)
    _print_step2(simulation_report)
    _print_step3(game_theory_report)
    _print_step4(decision_report)
    _print_step5(economic_report)

    _sep()
    print("  PIPELINE COMPLETE")
    print(f"  Full report    : {report_path}")
    print(f"  Game theory    : {gt_path}")
    print(f"  QUBO decision  : {qubo_path}")
    print(f"  Economic       : {eco_path}")
    print(f"  Log            : {_log_file}")
    _sep()

    return combined


if __name__ == "__main__":
    main()
