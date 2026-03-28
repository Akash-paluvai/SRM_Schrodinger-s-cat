"""
Quantum-Inspired QUBO (Quadratic Unconstrained Binary Optimization)
for supply chain route selection — Decision Layer (Step 4).

Problem formulation
-------------------
Binary variable x_i ∈ {0, 1}: x_i = 1 means route i is selected.

Objective (minimise):
    E(x) = x^T Q x

Q is assembled from two parts:
  1. Objective terms   — encode route cost (distance, risk, delay)
  2. Penalty terms     — encode hard/soft constraints

Constraints (encoded as quadratic penalties added to Q)
---------------------------------------------------------
  C1  One-hot selection  : Σ x_i = 1           (equality,   A = 10.0)
  C2  Risk threshold     : risk_i ≤ MAX_RISK    (inequality, B =  5.0)
  C3  SLA compliance     : delay_i ≤ SLA_DAYS   (inequality, C =  8.0)
  C4  Budget limit       : distance_i ≤ BUDGET  (inequality, D =  3.0)

Solver
------
  - Exact enumeration  : all 2^n binary vectors  (n ≤ 15, guaranteed optimal)
  - Simulated annealing: quantum-inspired stochastic search  (n > 15 or verification)

The solver is classical but follows the QUBO formalism used on D-Wave and
gate-model quantum annealers (QAOA), making the approach hardware-portable.
"""

import logging
import math
import random
from datetime import datetime, timezone

import numpy as np
import networkx as nx

logger = logging.getLogger(__name__)

# ── Penalty weights ───────────────────────────────────────────────────────────
PENALTY_ONE_HOT = 10.0   # C1: must select exactly one route
PENALTY_RISK    = 5.0    # C2: risk constraint violation
PENALTY_SLA     = 8.0    # C3: delay / SLA violation
PENALTY_BUDGET  = 3.0    # C4: budget / distance violation

# ── Constraint thresholds ─────────────────────────────────────────────────────
MAX_RISK_SCORE = 80.0    # out of 100
SLA_DAYS       = 30.0    # maximum acceptable delay (days)
BUDGET_KM      = 25_000  # maximum acceptable route distance (km)

# ── Objective normalisation weights ──────────────────────────────────────────
W_DISTANCE = 0.50
W_RISK     = 0.30
W_DELAY    = 0.20

MAX_PATH_CUTOFF = 6      # passed to nx.all_simple_paths


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _energy(Q: np.ndarray, x: np.ndarray) -> float:
    """QUBO energy: x^T Q x  (scalar)."""
    return float(x @ Q @ x)


def _build_route_features(
    paths: list[list[str]],
    graph: nx.DiGraph,
    expected_delay: float,
) -> list[dict]:
    """Convert graph paths to feature dicts consumed by the QUBO builder."""
    routes = []
    for path in paths:
        label = " → ".join(path)
        distance = sum(
            float(graph.edges[path[i], path[i + 1]].get("distance", 7000))
            for i in range(len(path) - 1)
        )
        # Average normalised risk across edges (0–1), convert to 0–100
        risk_norm_avg = sum(
            float(graph.edges[path[i], path[i + 1]].get("risk", 0.5))
            for i in range(len(path) - 1)
        ) / max(len(path) - 1, 1)

        routes.append({
            "name":     label,
            "path":     path,
            "distance": distance,
            "risk":     risk_norm_avg * 100.0,
            "delay":    expected_delay,
        })
    return routes


# ─────────────────────────────────────────────────────────────────────────────
# QUBO matrix builder
# ─────────────────────────────────────────────────────────────────────────────

def build_qubo_matrix(routes: list[dict]) -> tuple[np.ndarray, dict]:
    """
    Assemble the n×n QUBO matrix Q and a human-readable constraint log.

    Encoding
    --------
    Objective (diagonal):
        Q[i][i] += w_d*(dist_i/max_dist) + w_r*(risk_i/max_risk) + w_dl*(delay_i/max_delay)

    C1 — one-hot  (Σ x_i - 1)^2:
        diagonal  += -A
        off-diag  += +2A  for each pair (i < j)

    C2–C4 — soft inequality penalties:
        diagonal  += penalty_k   if route i violates constraint k
    """
    n = len(routes)
    Q = np.zeros((n, n), dtype=float)

    # Normalisers
    max_dist  = max(r["distance"] for r in routes) or 1.0
    max_risk  = max(r["risk"]     for r in routes) or 1.0
    max_delay = max(r["delay"]    for r in routes) or 1.0

    # ── Objective ────────────────────────────────────────────────────────────
    for i, r in enumerate(routes):
        Q[i][i] += (
            W_DISTANCE * r["distance"] / max_dist
            + W_RISK   * r["risk"]     / max_risk
            + W_DELAY  * r["delay"]    / max_delay
        )

    # ── C1: One-hot selection ────────────────────────────────────────────────
    A = PENALTY_ONE_HOT
    for i in range(n):
        Q[i][i] -= A
    for i in range(n):
        for j in range(i + 1, n):
            Q[i][j] += 2.0 * A

    # ── C2: Risk threshold ───────────────────────────────────────────────────
    c2_violated = []
    for i, r in enumerate(routes):
        if r["risk"] > MAX_RISK_SCORE:
            Q[i][i] += PENALTY_RISK
            c2_violated.append(r["name"])

    # ── C3: SLA compliance ───────────────────────────────────────────────────
    c3_violated = []
    for i, r in enumerate(routes):
        if r["delay"] > SLA_DAYS:
            Q[i][i] += PENALTY_SLA
            c3_violated.append(r["name"])

    # ── C4: Budget limit ─────────────────────────────────────────────────────
    c4_violated = []
    for i, r in enumerate(routes):
        if r["distance"] > BUDGET_KM:
            Q[i][i] += PENALTY_BUDGET
            c4_violated.append(r["name"])

    constraint_log = [
        {
            "id":          "C1",
            "name":        "one_hot_selection",
            "type":        "equality",
            "formula":     "Σ x_i = 1",
            "description": "Exactly one route must be selected",
            "penalty_weight": A,
            "encoding":    "Q[i][i] -= A  |  Q[i][j] += 2A  for all i≠j",
            "status":      "always enforced",
        },
        {
            "id":          "C2",
            "name":        "risk_threshold",
            "type":        "inequality",
            "formula":     f"risk_i ≤ {MAX_RISK_SCORE}",
            "description": "Route aggregated risk score must not exceed threshold",
            "penalty_weight": PENALTY_RISK,
            "encoding":    "Q[i][i] += B  if route i violates",
            "violating_routes": c2_violated,
            "status":      "violated" if c2_violated else "satisfied",
        },
        {
            "id":          "C3",
            "name":        "sla_compliance",
            "type":        "inequality",
            "formula":     f"delay_i ≤ {SLA_DAYS} days",
            "description": "Expected delivery delay must be within SLA",
            "penalty_weight": PENALTY_SLA,
            "encoding":    "Q[i][i] += C  if route i violates",
            "violating_routes": c3_violated,
            "status":      "violated" if c3_violated else "satisfied",
        },
        {
            "id":          "C4",
            "name":        "budget_limit",
            "type":        "inequality",
            "formula":     f"distance_i ≤ {BUDGET_KM} km",
            "description": "Total route distance must be within budget",
            "penalty_weight": PENALTY_BUDGET,
            "encoding":    "Q[i][i] += D  if route i violates",
            "violating_routes": c4_violated,
            "status":      "violated" if c4_violated else "satisfied",
        },
    ]

    meta = {
        "n_routes": n,
        "constraints": constraint_log,
        "objective_weights": {"distance": W_DISTANCE, "risk": W_RISK, "delay": W_DELAY},
        "penalty_weights": {
            "one_hot_selection": PENALTY_ONE_HOT,
            "risk_threshold":    PENALTY_RISK,
            "sla_compliance":    PENALTY_SLA,
            "budget_limit":      PENALTY_BUDGET,
        },
        "thresholds": {
            "max_risk_score": MAX_RISK_SCORE,
            "sla_days":       SLA_DAYS,
            "budget_km":      BUDGET_KM,
        },
        "normalisers": {
            "max_distance_km": round(max_dist, 2),
            "max_risk_score":  round(max_risk, 2),
            "max_delay_days":  round(max_delay, 2),
        },
    }
    return Q, meta


# ─────────────────────────────────────────────────────────────────────────────
# Solvers
# ─────────────────────────────────────────────────────────────────────────────

def _solve_exact(Q: np.ndarray, routes: list[dict]) -> dict:
    """
    Exact QUBO solver: enumerate all 2^n assignments.
    Guaranteed optimal. Practical for n ≤ 15.
    """
    n = len(routes)
    best_energy = float("inf")
    best_x = None
    one_hot_best_energy = float("inf")
    one_hot_best_x = None

    for mask in range(1 << n):
        x = np.array([(mask >> i) & 1 for i in range(n)], dtype=float)
        e = _energy(Q, x)
        if e < best_energy:
            best_energy = e
            best_x = x.copy()
        if int(x.sum()) == 1 and e < one_hot_best_energy:
            one_hot_best_energy = e
            one_hot_best_x = x.copy()

    if one_hot_best_x is not None:
        idx = int(np.argmax(one_hot_best_x))
        return {
            "selected_index":      idx,
            "selected_route":      routes[idx],
            "energy":              round(one_hot_best_energy, 6),
            "global_min_energy":   round(best_energy, 6),
            "solver":              "exact_enumeration",
            "feasible":            True,
            "solutions_evaluated": 1 << n,
        }

    # No valid one-hot found (degenerate graph) — return argmax of best
    idx = int(np.argmax(best_x)) if best_x is not None else 0
    return {
        "selected_index":      idx,
        "selected_route":      routes[idx],
        "energy":              round(best_energy, 6),
        "global_min_energy":   round(best_energy, 6),
        "solver":              "exact_enumeration",
        "feasible":            False,
        "note":                "No valid one-hot solution; returning global minimum",
        "solutions_evaluated": 1 << n,
    }


def _solve_simulated_annealing(
    Q: np.ndarray,
    routes: list[dict],
    n_steps: int = 8000,
    T_start: float = 2.0,
    T_end: float = 0.005,
) -> dict:
    """
    Simulated annealing QUBO solver (quantum-inspired metaheuristic).
    Mirrors the Metropolis criterion used in quantum annealing hardware.
    """
    n = len(routes)
    # Start from a random one-hot vector
    x = np.zeros(n)
    x[random.randint(0, n - 1)] = 1.0
    current_e = _energy(Q, x)
    best_x, best_e = x.copy(), current_e

    T = T_start
    decay = (T_end / T_start) ** (1.0 / max(n_steps, 1))

    for _ in range(n_steps):
        i = random.randint(0, n - 1)
        x_new = x.copy()
        x_new[i] = 1.0 - x_new[i]
        new_e = _energy(Q, x_new)
        delta = new_e - current_e
        if delta < 0 or random.random() < math.exp(-delta / max(T, 1e-9)):
            x = x_new
            current_e = new_e
            if current_e < best_e:
                best_e = current_e
                best_x = x.copy()
        T *= decay

    idx = int(np.argmax(best_x))
    return {
        "selected_index": idx,
        "selected_route": routes[idx],
        "energy":         round(best_e, 6),
        "solver":         "simulated_annealing",
        "feasible":       int(best_x.sum()) == 1,
        "n_steps":        n_steps,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_qubo_optimizer(
    graph: nx.DiGraph,
    source: str,
    destination: str,
    intelligence_state: dict,
    simulation_output: dict,
    game_theory_output: dict | None = None,
) -> dict:
    """
    QUBO-based route optimizer.

    1. Enumerates all simple paths in the graph.
    2. Builds feature vectors (distance, risk, delay) for each path.
    3. Constructs the QUBO Q matrix with objective + 4 constraint penalties.
    4. Solves via exact enumeration (n ≤ 15) with SA cross-verification.
    5. Returns full transparency report: Q matrix, per-route energies,
       constraint violations, optimality justification.
    """
    expected_delay = float(simulation_output.get("expected_delay", 5.0))

    # ── Enumerate paths ───────────────────────────────────────────────────────
    try:
        all_paths = list(nx.all_simple_paths(graph, source, destination,
                                             cutoff=MAX_PATH_CUTOFF))
    except Exception as exc:
        return {"error": str(exc), "timestamp": datetime.now(timezone.utc).isoformat()}

    if not all_paths:
        return {
            "error":     f"No paths from {source} to {destination}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # ── Build feature vectors ─────────────────────────────────────────────────
    routes = _build_route_features(all_paths, graph, expected_delay)
    n = len(routes)
    logger.info("QUBO | %d routes to evaluate  (%s → %s)", n, source, destination)

    # ── Assemble Q ────────────────────────────────────────────────────────────
    Q, qubo_meta = build_qubo_matrix(routes)

    # ── Solve ─────────────────────────────────────────────────────────────────
    if n <= 15:
        primary = _solve_exact(Q, routes)
    else:
        primary = _solve_simulated_annealing(Q, routes)

    sa_check = _solve_simulated_annealing(Q, routes)
    solvers_agree = (sa_check["selected_route"]["name"] ==
                     primary["selected_route"]["name"])

    # ── Per-route energy breakdown ────────────────────────────────────────────
    route_energies = []
    for i, r in enumerate(routes):
        x = np.zeros(n)
        x[i] = 1.0
        e = _energy(Q, x)
        route_energies.append({
            "rank":          0,           # filled below
            "route":         r["name"],
            "path":          r["path"],
            "qubo_energy":   round(e, 6),
            "distance_km":   round(r["distance"], 1),
            "risk_score":    round(r["risk"], 2),
            "delay_days":    round(r["delay"], 2),
            "selected":      r["name"] == primary["selected_route"]["name"],
            "constraint_violations": {
                "C2_risk":   r["risk"]     > MAX_RISK_SCORE,
                "C3_sla":    r["delay"]    > SLA_DAYS,
                "C4_budget": r["distance"] > BUDGET_KM,
            },
        })

    route_energies.sort(key=lambda x: x["qubo_energy"])
    for rank, row in enumerate(route_energies, start=1):
        row["rank"] = rank

    # ── Q matrix as labelled dict ─────────────────────────────────────────────
    labels = [r["name"] for r in routes]
    q_matrix_readable = {
        labels[i]: {labels[j]: round(float(Q[i][j]), 6) for j in range(n)}
        for i in range(n)
    }

    # ── Optimality justification ──────────────────────────────────────────────
    best = route_energies[0]
    second = route_energies[1] if len(route_energies) > 1 else None
    energy_gap = round(second["qubo_energy"] - best["qubo_energy"], 6) if second else None

    optimality = {
        "selected_route":  best["route"],
        "qubo_energy":     best["qubo_energy"],
        "energy_gap_to_next": energy_gap,
        "why_optimal": (
            f"Route '{best['route']}' achieves the lowest QUBO energy ({best['qubo_energy']:.4f}) "
            f"among {n} candidates after encoding objective (50% distance, 30% risk, 20% delay) "
            f"and penalty terms for {len(qubo_meta['constraints'])} constraints. "
            + (f"Next-best route has energy gap of {energy_gap:.4f}." if energy_gap else "")
        ),
        "constraint_summary": {
            c["name"]: c["status"] for c in qubo_meta["constraints"]
        },
        "solvers_agree":   solvers_agree,
        "solver_primary":  primary["solver"],
        "solver_verify":   sa_check["solver"],
    }

    logger.info(
        "QUBO optimal: %s  energy=%.4f  gap=%.4f  solvers_agree=%s",
        best["route"], best["qubo_energy"],
        energy_gap or 0.0, solvers_agree,
    )

    return {
        "optimal_route":       primary["selected_route"]["path"],
        "optimal_route_label": primary["selected_route"]["name"],
        "qubo_energy":         primary["energy"],
        "feasible":            primary.get("feasible", True),
        "solver_used":         primary["solver"],
        "sa_verification": {
            "route":  sa_check["selected_route"]["name"],
            "energy": sa_check["energy"],
            "agrees": solvers_agree,
        },
        "optimality_report":   optimality,
        "route_energies":      route_energies,
        "qubo_matrix":         q_matrix_readable,
        "constraints":         qubo_meta["constraints"],
        "objective_weights":   qubo_meta["objective_weights"],
        "penalty_weights":     qubo_meta["penalty_weights"],
        "thresholds":          qubo_meta["thresholds"],
        "normalisers":         qubo_meta["normalisers"],
        "n_routes_evaluated":  n,
        "source":              source,
        "destination":         destination,
        "timestamp":           datetime.now(timezone.utc).isoformat(),
    }
