"""
Optimizer Module.

Implements route optimisation strategies on a weighted NetworkX graph.

Current strategies:
  - dijkstra     : Shortest path by composite weight (production-ready)
  - astar        : A* with distance heuristic (production-ready)

Future stubs (safe to extend without refactoring):
  - rl           : Reinforcement Learning (stub)
  - game_theory  : Game-Theoretic multi-agent optimisation (stub)
"""

import logging
import math
from typing import Any

import networkx as nx

logger = logging.getLogger(__name__)


class Optimizer:
    """
    Strategy-pattern optimizer for supply chain route selection.

    Usage:
        opt = Optimizer(graph)
        result = opt.run("Mumbai", "Rotterdam", method="dijkstra")
    """

    def __init__(self, graph: nx.DiGraph):
        self.graph = graph

    # ------------------------------------------------------------------
    # Public dispatch
    # ------------------------------------------------------------------
    def run(
        self,
        source: str,
        destination: str,
        method: str = "dijkstra",
    ) -> dict[str, Any]:
        """
        Run the specified optimisation strategy.

        Args:
            source:      Start node name.
            destination: End node name.
            method:      One of 'dijkstra', 'astar', 'rl', 'game_theory'.

        Returns:
            Structured result dict.

        Raises:
            ValueError: If method is unknown.
        """
        logger.info(
            f"Optimizer.run() | source={source} | "
            f"dest={destination} | method={method}"
        )

        if method == "dijkstra":
            return self._run_dijkstra(source, destination)
        elif method == "astar":
            return self._run_astar(source, destination)
        elif method == "rl":
            return self._run_rl(source, destination)
        elif method == "game_theory":
            return self._run_game_theory(source, destination)
        else:
            raise ValueError(
                f"Unknown optimisation method: '{method}'. "
                f"Choose from: dijkstra, astar, rl, game_theory"
            )

    # ------------------------------------------------------------------
    # Strategy: Dijkstra (MVP — production ready)
    # ------------------------------------------------------------------
    def _run_dijkstra(self, source: str, destination: str) -> dict[str, Any]:
        """
        Find the minimum-weight path using Dijkstra's algorithm.

        Uses the 'weight' edge attribute which encodes:
            0.5 * distance_norm + 0.3 * risk + 0.2 * delay
        """
        try:
            path = nx.dijkstra_path(
                self.graph, source, destination, weight="weight"
            )
            path_length = nx.dijkstra_path_length(
                self.graph, source, destination, weight="weight"
            )
        except nx.NetworkXNoPath:
            return self._no_path_result(source, destination, "dijkstra")
        except nx.NodeNotFound as exc:
            return self._node_not_found_result(str(exc), "dijkstra")

        metrics = self._aggregate_path_metrics(path)

        logger.info(
            f"Dijkstra path: {' → '.join(path)} | "
            f"score={path_length:.4f}"
        )

        return {
            "best_route":      path,
            "total_distance":  metrics["total_distance"],
            "total_risk":      metrics["total_risk"],
            "total_delay":     metrics["total_delay"],
            "final_score":     round(path_length, 6),
            "method_used":     "dijkstra",
            "reason":          "Lowest combined cost under uncertainty "
                               "(weighted: 50% distance, 30% risk, 20% delay)",
            "edge_details":    metrics["edges"],
        }

    # ------------------------------------------------------------------
    # Strategy: A* (production ready)
    # ------------------------------------------------------------------
    def _run_astar(self, source: str, destination: str) -> dict[str, Any]:
        """
        Find the minimum-weight path using A* with a distance heuristic.

        Heuristic: rough geodesic approximation using node position data
        if available, otherwise falls back to zero heuristic (= Dijkstra).
        """
        def heuristic(u: str, v: str) -> float:
            """
            Node position heuristic.
            If nodes store lat/lon, compute Euclidean distance as proxy.
            Falls back to 0 (admissible — degrades to Dijkstra).
            """
            u_data = self.graph.nodes.get(u, {})
            v_data = self.graph.nodes.get(v, {})
            u_lat, u_lon = u_data.get("lat", 0), u_data.get("lon", 0)
            v_lat, v_lon = v_data.get("lat", 0), v_data.get("lon", 0)
            return math.sqrt((u_lat - v_lat) ** 2 + (u_lon - v_lon) ** 2)

        try:
            path = nx.astar_path(
                self.graph, source, destination,
                heuristic=heuristic,
                weight="weight",
            )
        except nx.NetworkXNoPath:
            return self._no_path_result(source, destination, "astar")
        except nx.NodeNotFound as exc:
            return self._node_not_found_result(str(exc), "astar")

        metrics = self._aggregate_path_metrics(path)
        final_score = sum(e["weight"] for e in metrics["edges"])

        logger.info(
            f"A* path: {' → '.join(path)} | score={final_score:.4f}"
        )

        return {
            "best_route":      path,
            "total_distance":  metrics["total_distance"],
            "total_risk":      metrics["total_risk"],
            "total_delay":     metrics["total_delay"],
            "final_score":     round(final_score, 6),
            "method_used":     "astar",
            "reason":          "A* heuristic search — optimises composite "
                               "weight with distance-based pruning",
            "edge_details":    metrics["edges"],
        }

    # ------------------------------------------------------------------
    # Strategy: RL (stub — future)
    # ------------------------------------------------------------------
    def _run_rl(self, source: str, destination: str) -> dict[str, Any]:
        """
        Reinforcement Learning optimisation — stub for future implementation.

        Integration plan:
          - State:  Current node + remaining risk budget
          - Action: Choose next edge
          - Reward: -edge_weight (minimise cumulative cost)
          - Algorithm: Q-learning or PPO (via stable-baselines3)
        """
        logger.info("RL optimizer called — stub only")
        return {
            "best_route":   [],
            "final_score":  None,
            "method_used":  "rl",
            "message":      "RL optimization not yet implemented. "
                            "Planned: Q-learning / PPO via stable-baselines3.",
            "stub":         True,
        }

    # ------------------------------------------------------------------
    # Strategy: Game Theory (stub — future)
    # ------------------------------------------------------------------
    def _run_game_theory(self, source: str, destination: str) -> dict[str, Any]:
        """
        Game-theoretic multi-agent optimisation — stub for future implementation.

        Integration plan:
          - Players:   Shipper, Carrier, Insurer
          - Strategy:  Nash Equilibrium on route selection
          - Tool:      nashpy or custom zero-sum solver
        """
        logger.info("Game-theory optimizer called — stub only")
        return {
            "best_route":   [],
            "final_score":  None,
            "method_used":  "game_theory",
            "message":      "Game-theoretic optimization not yet implemented. "
                            "Planned: Nash Equilibrium via nashpy.",
            "stub":         True,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _aggregate_path_metrics(self, path: list[str]) -> dict[str, Any]:
        """Sum edge-level metrics along a path."""
        total_distance = 0.0
        total_risk     = 0.0
        total_delay    = 0.0
        edge_details   = []

        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            data = self.graph.edges[u, v]

            total_distance += data.get("distance", 0.0)
            total_risk     += data.get("risk", 0.0)
            total_delay    += data.get("delay", 0.0)

            edge_details.append({
                "from":     u,
                "to":       v,
                "distance": data.get("distance", 0.0),
                "risk":     round(data.get("risk", 0.0), 4),
                "delay":    round(data.get("delay", 0.0), 4),
                "weight":   round(data.get("weight", 0.0), 6),
            })

        return {
            "total_distance": round(total_distance, 2),
            "total_risk":     round(total_risk, 4),
            "total_delay":    round(total_delay, 4),
            "edges":          edge_details,
        }

    def _no_path_result(
        self, source: str, dest: str, method: str
    ) -> dict[str, Any]:
        logger.error(f"No path found: {source} → {dest}")
        return {
            "best_route":  [],
            "final_score": None,
            "method_used": method,
            "error":       f"No path exists from '{source}' to '{dest}'",
        }

    def _node_not_found_result(
        self, exc_msg: str, method: str
    ) -> dict[str, Any]:
        logger.error(f"Node not found: {exc_msg}")
        return {
            "best_route":  [],
            "final_score": None,
            "method_used": method,
            "error":       f"Node not found in graph: {exc_msg}",
        }
