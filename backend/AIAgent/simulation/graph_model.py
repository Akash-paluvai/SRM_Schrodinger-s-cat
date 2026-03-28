"""
Supply Chain Graph Model.

Represents the supply chain as a directed graph using NetworkX.
Each node carries operational attributes (base_delay, risk, capacity).
Edges define the propagation path with a configurable decay multiplier.
"""

import logging
import networkx as nx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Node definitions
# ---------------------------------------------------------------------------
# Each entry: node_id → default attributes
DEFAULT_NODES: dict[str, dict] = {
    "supplier": {
        "base_delay": 1.0,   # days
        "risk": 0.2,         # 0–1 probability of disruption
        "capacity": 1.0,     # relative throughput capacity
        "label": "Supplier",
    },
    "port_origin": {
        "base_delay": 0.5,
        "risk": 0.15,
        "capacity": 0.9,
        "label": "Origin Port",
    },
    "shipping": {
        "base_delay": 7.0,
        "risk": 0.25,
        "capacity": 0.8,
        "label": "Shipping (Ocean)",
    },
    "port_destination": {
        "base_delay": 0.5,
        "risk": 0.15,
        "capacity": 0.85,
        "label": "Destination Port",
    },
    "warehouse": {
        "base_delay": 0.5,
        "risk": 0.1,
        "capacity": 0.95,
        "label": "Warehouse",
    },
    "customer": {
        "base_delay": 0.0,
        "risk": 0.05,
        "capacity": 1.0,
        "label": "Customer",
    },
}

# Ordered chain — propagation follows this direction
SUPPLY_CHAIN_EDGES = [
    ("supplier",          "port_origin"),
    ("port_origin",       "shipping"),
    ("shipping",          "port_destination"),
    ("port_destination",  "warehouse"),
    ("warehouse",         "customer"),
]

# Delay decay factor applied at each downstream hop
PROPAGATION_DECAY = 0.85

# Fraction of upstream delay that propagates downstream
PROPAGATION_FACTOR = 0.75


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------
def build_supply_chain_graph() -> nx.DiGraph:
    """
    Construct the default supply chain directed graph.

    Returns:
        Populated nx.DiGraph with node attributes and edges.
    """
    G = nx.DiGraph()

    for node_id, attrs in DEFAULT_NODES.items():
        G.add_node(node_id, **attrs)

    for src, dst in SUPPLY_CHAIN_EDGES:
        G.add_edge(src, dst, propagation_factor=PROPAGATION_FACTOR)

    logger.debug(
        f"Graph built: {G.number_of_nodes()} nodes, "
        f"{G.number_of_edges()} edges"
    )
    return G


def apply_agent_risks(G: nx.DiGraph, agent_results: list[dict]) -> nx.DiGraph:
    """
    Override node risk values using live agent risk scores.

    Mapping strategy:
        weather  → shipping, port_origin, port_destination
        news     → all nodes (macro risk)
        traffic  → port_origin, port_destination, warehouse
        supplier → supplier
        demand   → customer, warehouse

    Args:
        G: The supply chain graph.
        agent_results: List of agent output dicts containing 'agent' and 'risk_score'.

    Returns:
        Updated graph (mutated in place, also returned for fluency).
    """
    # Build a lookup: agent_name → normalised risk (0–1)
    risk_lookup: dict[str, float] = {}
    for output in agent_results:
        name = output.get("agent", "")
        score = output.get("risk_score", 30)
        risk_lookup[name] = score / 100.0

    # Map agent risks to graph nodes
    node_risk_updates: dict[str, list[float]] = {n: [] for n in G.nodes}

    mappings = {
        "weather":  ["shipping", "port_origin", "port_destination"],
        "news":     list(G.nodes),
        "traffic":  ["port_origin", "port_destination", "warehouse"],
        "supplier": ["supplier"],
        "demand":   ["customer", "warehouse"],
    }

    for agent, nodes in mappings.items():
        risk_val = risk_lookup.get(agent, 0.3)
        for node in nodes:
            if node in node_risk_updates:
                node_risk_updates[node].append(risk_val)

    # Average contributions and update node attributes
    for node, risk_values in node_risk_updates.items():
        if risk_values:
            avg_risk = sum(risk_values) / len(risk_values)
            G.nodes[node]["risk"] = round(avg_risk, 4)
            logger.debug(f"Node [{node}] risk updated to {avg_risk:.4f}")

    return G


def get_node_order(G: nx.DiGraph) -> list[str]:
    """Return nodes in topological order (source → sink)."""
    return list(nx.topological_sort(G))
