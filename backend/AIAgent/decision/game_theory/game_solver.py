"""
Game Theory Solver — minimax, expected-value, and risk-adjusted route selection.
"""
import logging
import math
import statistics
from datetime import datetime, timezone
from typing import Any

import networkx as nx

from decision.game_theory.scenario_generator import generate_scenarios

logger = logging.getLogger(__name__)

LAMBDA_RISK       = 0.5
MAX_RISK_THRESHOLD = 0.90
MAX_PATH_CUTOFF   = 6


def _label(path): return " → ".join(path)


def _costs(graph, paths, scenarios):
    out = {}
    for path in paths:
        lbl = _label(path)
        out[lbl] = {}
        for sc in scenarios:
            cost = 0.0
            for i in range(len(path) - 1):
                e = graph.edges[path[i], path[i+1]]
                cost += (float(e.get("distance_norm", 0.0))
                         + float(e.get("risk",  0.0)) * sc["risk_mult"]
                         + float(e.get("delay", 0.0)) * sc["delay_mult"])
            out[lbl][sc["name"]] = round(cost, 6)
    return out


def _filter_high_risk(paths, graph, threshold=MAX_RISK_THRESHOLD):
    safe, removed = [], []
    for path in paths:
        max_r = max(float(graph.edges[path[i], path[i+1]].get("risk", 0.0))
                    for i in range(len(path)-1))
        (removed if max_r > threshold else safe).append(
            _label(path) if max_r > threshold else path)
    safe2, rem2 = [], []
    for path in paths:
        max_r = max(float(graph.edges[path[i], path[i+1]].get("risk", 0.0))
                    for i in range(len(path)-1))
        (rem2 if max_r > threshold else safe2).append(
            _label(path) if max_r > threshold else path)
    return safe2, rem2


def _drop_dominated(costs):
    labels, dominated = list(costs.keys()), set()
    for b in labels:
        if b in dominated: continue
        for a in labels:
            if a == b or a in dominated: continue
            sc = list(costs[a].keys())
            if all(costs[a][s] <= costs[b][s] for s in sc) and \
               any(costs[a][s] <  costs[b][s] for s in sc):
                dominated.add(b); break
    return {k: v for k, v in costs.items() if k not in dominated}, list(dominated)


def run_game_theory_engine(
    graph,
    source,
    destination,
    simulation_output=None,
    intelligence_state=None,
    lambda_risk=LAMBDA_RISK,
):
    sim, intel = simulation_output or {}, intelligence_state or {}
    logger.info("GAME THEORY | %s → %s", source, destination)

    scenarios  = generate_scenarios(sim, intel)
    sc_names   = [s["name"] for s in scenarios]
    sc_probs   = {s["name"]: s["probability"] for s in scenarios}

    def _err(msg):
        return {"error": msg, "robust_route": [], "expected_optimal_route": [],
                "risk_adjusted_route": [], "confidence": 0.0, "payoff_matrix": {},
                "route_costs": {}, "scenarios": scenarios, "strategy_scores": {},
                "dominated_removed": [], "high_risk_removed": [],
                "lambda_risk": lambda_risk,
                "timestamp": datetime.now(timezone.utc).isoformat()}

    try:
        all_paths = list(nx.all_simple_paths(graph, source, destination, cutoff=MAX_PATH_CUTOFF))
    except Exception as e:
        return _err(str(e))

    if not all_paths:
        return _err(f"No paths from {source} to {destination}")

    safe, hi_risk_removed = _filter_high_risk(all_paths, graph)
    if not safe:
        safe, hi_risk_removed = all_paths, []

    route_costs = _costs(graph, safe, scenarios)
    filtered, dom_removed = _drop_dominated(route_costs)
    if not filtered:
        filtered, dom_removed = route_costs, []

    labels = list(filtered.keys())
    payoff = {l: {s: round(-c, 6) for s, c in d.items()} for l, d in filtered.items()}

    def exp(l):  return sum(sc_probs[s] * filtered[l][s] for s in sc_names)
    def var(l):
        v = [filtered[l][s] for s in sc_names]
        return statistics.variance(v) if len(v) > 1 else 0.0
    def ra(l):   return exp(l) + lambda_risk * math.sqrt(var(l))

    robust   = min(labels, key=lambda l: max(filtered[l][s] for s in sc_names))
    expected = min(labels, key=exp)
    risk_adj = min(labels, key=ra)

    variances  = [var(l) for l in labels]
    rv         = variances[labels.index(robust)]
    mv         = max(variances) if variances else 0.0
    confidence = round(1.0 - (rv / mv) if mv > 0 else 1.0, 4)

    ltp = {_label(p): p for p in safe}
    res = lambda l: ltp.get(l, l.split(" → "))

    scores = {l: {"worst_case_cost": round(max(filtered[l][s] for s in sc_names), 6),
                  "expected_cost":   round(exp(l), 6),
                  "risk_adjusted_score": round(ra(l), 6),
                  "variance":        round(var(l), 6)} for l in labels}

    logger.info("GT robust=%s  expected=%s  conf=%s", robust, expected, confidence)

    return {
        "robust_route":           res(robust),
        "expected_optimal_route": res(expected),
        "risk_adjusted_route":    res(risk_adj),
        "confidence":             confidence,
        "payoff_matrix":          payoff,
        "route_costs":            {l: dict(c) for l, c in filtered.items()},
        "scenarios":              scenarios,
        "strategy_scores":        scores,
        "dominated_removed":      dom_removed,
        "high_risk_removed":      hi_risk_removed,
        "lambda_risk":            lambda_risk,
        "timestamp":              datetime.now(timezone.utc).isoformat(),
    }
