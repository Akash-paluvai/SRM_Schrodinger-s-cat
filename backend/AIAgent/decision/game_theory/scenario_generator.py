"""Generates disruption scenarios for the game theory payoff matrix."""
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _clamp(v, lo=0.0, hi=1.0): return max(lo, min(hi, v))


def _norm(scenarios):
    total = sum(s["probability"] for s in scenarios)
    total = total if total > 0 else 1.0
    for s in scenarios:
        s["probability"] = round(s["probability"] / total, 6)
    return scenarios


def generate_scenarios(simulation_output=None, intelligence_state=None):
    sim   = simulation_output   or {}
    intel = intelligence_state  or {}

    exp_delay   = float(sim.get("expected_delay",   10.0))
    worst_delay = float(sim.get("worst_case_delay", exp_delay * 2.5))
    disrupt_p   = float(sim.get("disruption_probability", 0.3))

    geo    = bool(intel.get("geopolitical_alert", False))
    strike = bool(intel.get("port_strike_signal", False))
    cycl   = bool(intel.get("cyclone_watch",      False))

    flags = intel.get("agent_flags", {})
    if flags.get("weather") == "CRITICAL": cycl = True
    if flags.get("news")    == "HIGH":     geo  = True

    scenarios = [
        {
            "name":        "normal",
            "probability": _clamp(1.0 - disrupt_p - 0.05),
            "risk_mult":   1.0,
            "delay_mult":  max(1.0, exp_delay / 10.0),
            "description": "Baseline — no major disruption",
        },
        {
            "name":        "storm",
            "probability": 0.30 if cycl else 0.15,
            "risk_mult":   2.2  if cycl else 1.6,
            "delay_mult":  max(2.0, worst_delay / exp_delay) if exp_delay > 0 else 2.0,
            "description": "Severe weather event",
        },
        {
            "name":        "conflict",
            "probability": 0.20 if geo else 0.10,
            "risk_mult":   3.0  if geo else 2.0,
            "delay_mult":  2.5  if geo else 1.8,
            "description": "Geopolitical conflict or canal closure",
        },
    ]
    if strike:
        scenarios.append({
            "name": "port_strike", "probability": 0.15,
            "risk_mult": 1.8, "delay_mult": 2.0,
            "description": "Labour strike at major port",
        })

    scenarios = _norm(scenarios)
    logger.info("Scenarios: %s", ", ".join(f"{s['name']}({s['probability']:.2f})" for s in scenarios))
    return scenarios
