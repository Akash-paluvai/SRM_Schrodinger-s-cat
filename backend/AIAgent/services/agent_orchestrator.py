"""
services/agent_orchestrator.py
──────────────────────────────
Dynamically discovers and runs all existing agents, then aggregates
their outputs into a unified intelligence result.

Each agent writes to its own key in agentData; the orchestrator
computes a combined decision summary and writes to insights.data.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from agents import (
    WeatherAgent,
    TrafficAgent,
    DemandAgent,
    NewsAgent,
    SupplierAgent,
)

logger = logging.getLogger(__name__)

# ── Well-known city → (lat, lng) lookup ──────────────────────────────────────
# Used to pass coordinates to weather/traffic agents from shipment locations.
_CITY_COORDS: Dict[str, tuple[float, float]] = {
    "mumbai":      (19.0760, 72.8777),
    "delhi":       (28.6139, 77.2090),
    "chennai":     (13.0827, 80.2707),
    "kolkata":     (22.5726, 88.3639),
    "rotterdam":   (51.9225, 4.4792),
    "singapore":   (1.3521, 103.8198),
    "shanghai":    (31.2304, 121.4737),
    "dubai":       (25.2048, 55.2708),
    "hamburg":     (53.5511, 9.9937),
    "los angeles": (33.9425, -118.4081),
    "new york":    (40.7128, -74.0060),
    "london":      (51.5074, -0.1278),
    "tokyo":       (35.6762, 139.6503),
    "hong kong":   (22.3193, 114.1694),
    "busan":       (35.1796, 129.0756),
    "jeddah":      (21.4858, 39.1925),
    "port klang":  (3.0006, 101.3928),
}

DEFAULT_COORDS = (19.0760, 72.8777)   # Mumbai fallback


def _resolve_coords(location: str) -> tuple[float, float]:
    """Best-effort city name → (lat, lng)."""
    key = location.strip().lower().split(",")[0].strip()
    return _CITY_COORDS.get(key, DEFAULT_COORDS)


# ── Agent registry ───────────────────────────────────────────────────────────
# Maps agent name → class.  New agents just need to be added here.

_AGENT_REGISTRY: Dict[str, type] = {
    "weather":  WeatherAgent,
    "traffic":  TrafficAgent,
    "demand":   DemandAgent,
    "news":     NewsAgent,
    "supplier": SupplierAgent,
}


def run_all_agents(
    source_location: str = "Mumbai, India",
    destination_location: str = "Rotterdam, Netherlands",
    shipment_type: str | None = None,
    keywords: list[str] | None = None,
) -> Dict[str, Any]:
    """
    Run every registered agent and return a unified result.

    Returns
    -------
    {
        "agent_outputs": { "<name>": { ...agent.run() output... }, ... },
        "aggregated": {
            "riskScore": float,
            "costAnalysis": {...},
            "delays": {...},
            "recommendations": [...],
            "agentBreakdown": [...],
            "summary": str,
        },
        "timestamp": str,
    }
    """
    src_lat, src_lon = _resolve_coords(source_location)
    dst_lat, dst_lon = _resolve_coords(destination_location)

    agent_outputs: Dict[str, Any] = {}
    risk_scores: List[float] = []
    agent_breakdown: List[Dict[str, Any]] = []

    for name, cls in _AGENT_REGISTRY.items():
        try:
            # Instantiate with context-aware params
            if name == "weather":
                agent = cls(lat=dst_lat, lon=dst_lon)
            elif name == "traffic":
                agent = cls(lat=src_lat, lon=src_lon)
            elif name == "demand":
                kw = keywords or ["supply chain", "shipping delay"]
                if shipment_type:
                    kw = [shipment_type] + kw
                agent = cls(keywords=kw)
            else:
                agent = cls()

            logger.info(f"Running agent: {name}")
            result = agent.run()
            agent_outputs[name] = result
            risk_scores.append(result.get("risk_score", 0))
            agent_breakdown.append({
                "agent":      name,
                "risk_score": result.get("risk_score", 0),
                "confidence": result.get("confidence", 0),
                "reason":     result.get("reason", ""),
            })

        except Exception as exc:
            logger.error(f"Agent [{name}] crashed: {exc}", exc_info=True)
            fallback = {
                "agent": name,
                "risk_score": 30.0,
                "reason": f"Agent error: {exc}",
                "confidence": 0.1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            agent_outputs[name] = fallback
            risk_scores.append(30.0)
            agent_breakdown.append({
                "agent": name, "risk_score": 30.0,
                "confidence": 0.1, "reason": f"Agent error: {exc}",
            })

    # ── Aggregate ─────────────────────────────────────────────────────────
    avg_risk = round(sum(risk_scores) / max(len(risk_scores), 1), 2)
    max_risk = max(risk_scores) if risk_scores else 0
    min_risk = min(risk_scores) if risk_scores else 0

    # Simple cost heuristic based on risk
    base_cost = 50000.0
    risk_multiplier = 1 + (avg_risk / 100.0) * 0.5
    estimated_cost = round(base_cost * risk_multiplier, 2)

    # Delay estimation (hours) based on risk
    base_delay_hours = 48
    delay_hours = round(base_delay_hours * (1 + avg_risk / 200.0), 1)

    # Recommendations
    recommendations: List[str] = []
    if avg_risk > 70:
        recommendations.append("CRITICAL: Consider alternative routes or transport modes immediately.")
    elif avg_risk > 50:
        recommendations.append("HIGH RISK: Monitor conditions closely and prepare contingencies.")
    elif avg_risk > 30:
        recommendations.append("MODERATE RISK: Standard monitoring recommended.")
    else:
        recommendations.append("LOW RISK: Conditions are favorable for shipment.")

    # Per-agent recommendations
    for bd in agent_breakdown:
        if bd["risk_score"] > 60:
            recommendations.append(
                f"Agent [{bd['agent']}] flagged high risk ({bd['risk_score']:.0f}): {bd['reason'][:120]}"
            )

    # Route decision
    if avg_risk > 60:
        route_decision = "Recommend diverting to alternate route due to elevated risk."
    else:
        route_decision = f"Primary route {source_location} → {destination_location} is viable."

    summary = (
        f"Composite risk score: {avg_risk}/100 "
        f"(range {min_risk:.0f}–{max_risk:.0f}) across {len(risk_scores)} agents. "
        f"Estimated cost: ${estimated_cost:,.0f}. "
        f"ETA adjustment: +{delay_hours - base_delay_hours:.1f}h."
    )

    aggregated = {
        "summary":         summary,
        "riskScore":       avg_risk,
        "costAnalysis":    {
            "baseCost":       base_cost,
            "riskMultiplier": round(risk_multiplier, 3),
            "estimatedTotal": estimated_cost,
        },
        "delays":          {
            "baseHours":     base_delay_hours,
            "adjustedHours": delay_hours,
            "riskImpact":    round(delay_hours - base_delay_hours, 1),
        },
        "routeDecision":     route_decision,
        "recommendations":   recommendations,
        "agentBreakdown":    agent_breakdown,
    }

    return {
        "agent_outputs": agent_outputs,
        "aggregated":    aggregated,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }
