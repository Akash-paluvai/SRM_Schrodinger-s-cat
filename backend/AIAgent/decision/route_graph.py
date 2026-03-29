"""
Route Graph Builder.

Constructs a weighted, directed NetworkX graph from route options.
Each edge carries: distance, risk, delay, and a composite weight.

The graph is designed to be:
  - Directly usable with Dijkstra / A* (via the 'weight' attribute)
  - Extensible for RL state spaces (nodes as states, edges as actions)
  - Extensible for Game Theory (multi-player edge utilities)
"""

import logging
import networkx as nx

from decision.cost_function import (
    CostConfig,
    DEFAULT_COST_CONFIG,
    compute_edge_weight,
    normalise_risk,
    normalise_delay,
    normalise_distance,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default global route network
# ---------------------------------------------------------------------------
# Pre-defined candidate routes between major supply chain hubs.
# Each tuple: (source_node, destination_node, distance_km)
DEFAULT_ROUTE_OPTIONS: list[tuple[str, str, float]] = [
    # Mumbai → Rotterdam (standard ocean routes)
    ("Mumbai",         "Suez Canal",      6_500.0),
    ("Mumbai",         "Cape of Good Hope", 11_800.0),
    ("Suez Canal",     "Rotterdam",        7_200.0),
    ("Cape of Good Hope", "Rotterdam",    10_100.0),

    # Intermediate port diversions
    ("Mumbai",         "Singapore",        3_900.0),
    ("Singapore",      "Suez Canal",       8_400.0),
    ("Singapore",      "Rotterdam",       11_200.0),

    # Air freight (short distance proxy — very fast, high cost)
    ("Mumbai",         "Dubai",              1_900.0),
    ("Dubai",          "Rotterdam",          5_800.0),
]

# Risk assignment: which nodes are affected by which agents
# Maps agent_name → list of node names that carry that agent's risk
AGENT_NODE_RISK_MAP: dict[str, list[str]] = {
    "weather":  ["Suez Canal", "Cape of Good Hope", "Singapore", "Dubai"],
    "news":     [],   # applied globally (macro risk)
    "traffic":  ["Mumbai", "Rotterdam", "Singapore", "Dubai"],
    "supplier": ["Mumbai"],
    "demand":   ["Rotterdam"],
}


# ---------------------------------------------------------------------------
# Risk extractor
# ---------------------------------------------------------------------------
def _extract_agent_risk(agent_results: list[dict]) -> dict[str, float]:
    """Build a lookup: agent_name → raw risk score (0–100)."""
    return {
        r.get("agent", ""): float(r.get("risk_score", 30))
        for r in (agent_results or [])
    }


def _node_risk(node: str, agent_risk: dict[str, float]) -> float:
    """
    Compute the blended risk for a node by averaging across all agents
    whose mapping includes that node, plus a global news component.

    Returns normalised risk (0–1).
    """
    contributions: list[float] = []

    for agent_name, nodes in AGENT_NODE_RISK_MAP.items():
        raw = agent_risk.get(agent_name, 30.0)
        if agent_name == "news":
            # News is a macro risk — all nodes share it at reduced weight
            contributions.append(raw * 0.4)
        elif node in nodes:
            contributions.append(raw)

    if not contributions:
        contributions.append(30.0)   # fallback default

    avg_raw = sum(contributions) / len(contributions)
    return normalise_risk(avg_raw)


def _edge_delay(
    source: str,
    dest: str,
    simulation_output: dict | None,
) -> float:
    """
    Extract per-edge delay from simulation output.

    Falls back to a distance-proportional estimate if simulation is absent.
    """
    if simulation_output:
        expected_delay = simulation_output.get("expected_delay", 10.0)
        # Simple heuristic: distribute total expected delay proportionally
        # Real impl would use per-leg simulation
        return normalise_delay(expected_delay)
    return 0.1   # default 0.1 (normalised) if no simulation data


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------
def build_graph(
    source: str | None = None,
    destination: str | None = None,
    route_options: list[tuple[str, str, float]] | None = None,
    agent_results: list[dict] | None = None,
    simulation_output: dict | None = None,
    config: CostConfig = DEFAULT_COST_CONFIG,
) -> nx.DiGraph:
    """
    Construct a weighted directed graph for route optimisation.

    Args:
        route_options:     List of (source, destination, distance_km) tuples.
                           Defaults to DEFAULT_ROUTE_OPTIONS.
        agent_results:     Agent risk outputs from the multi-agent system.
        simulation_output: Ripple Engine simulation result.
        config:            Cost function weight configuration.

    Returns:
        nx.DiGraph with 'weight', 'distance', 'risk', 'delay' on each edge.
    """
    edges = route_options or DEFAULT_ROUTE_OPTIONS
    edges = list(edges)  # copy to allow appending

    # Dynamically inject synthetic edges if source/dest are outside standard topology
    if source and destination:
        existing_nodes = {u for u, v, _ in edges} | {v for u, v, _ in edges}
        if source not in existing_nodes:
            logger.info("Injecting dynamic source: %s", source)
            edges.append((source, "Singapore", 3000.0))
            edges.append((source, "Dubai", 2500.0))
        if destination not in existing_nodes:
            logger.info("Injecting dynamic destination: %s", destination)
            edges.append(("Rotterdam", destination, 1000.0))
            edges.append(("Dubai", destination, 3500.0))

    agent_risk = _extract_agent_risk(agent_results)

    G = nx.DiGraph()

    for source, dest, distance_km in edges:
        # Normalise inputs
        norm_dist  = normalise_distance(distance_km)
        norm_risk  = _node_risk(dest, agent_risk)         # risk at destination
        norm_delay = _edge_delay(source, dest, simulation_output)

        weight = compute_edge_weight(norm_dist, norm_risk, norm_delay, config)

        G.add_edge(
            source, dest,
            distance=round(distance_km, 2),
            distance_norm=norm_dist,
            risk=norm_risk,
            delay=norm_delay,
            weight=weight,
        )

        logger.debug(
            f"Edge {source} → {dest}: "
            f"dist={norm_dist:.4f}, risk={norm_risk:.4f}, "
            f"delay={norm_delay:.4f}, weight={weight:.4f}"
        )

    logger.info(
        f"Route graph built: {G.number_of_nodes()} nodes, "
        f"{G.number_of_edges()} edges"
    )
    return G
