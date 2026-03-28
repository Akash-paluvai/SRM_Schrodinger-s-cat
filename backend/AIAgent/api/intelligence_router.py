"""
api/intelligence_router.py
──────────────────────────
FastAPI router — Intelligence endpoints that trigger agent orchestration
and serve aggregated supply chain intelligence from the DB.

Endpoints
---------
POST   /intelligence/{doc_id}/run         — run all agents, persist results
GET    /intelligence/{doc_id}             — read intelligence data
GET    /intelligence/order/{order_id}     — lookup by orderId
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from db.connection import get_database
from db.repository import SupplyChainRepository
from services.agent_orchestrator import run_all_agents

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Dependency ────────────────────────────────────────────────────────────────

def get_repo() -> SupplyChainRepository:
    return SupplyChainRepository(get_database())


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_404(doc_id: str, repo: SupplyChainRepository) -> Dict[str, Any]:
    doc = await repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SupplyChainRequest '{doc_id}' not found.",
        )
    return doc


def _build_intelligence_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Extract intelligence-relevant fields from a full document."""
    return {
        "orderId":         doc.get("orderId"),
        "agentData":       doc.get("agentData", {}),
        "insights":        doc.get("insights", {}),
        "systemState":     doc.get("systemState", {}),
        "trackingHistory": doc.get("trackingHistory", []),
        "currentLocation": doc.get("currentLocation"),
        "sourceLocation":       doc.get("sourceLocation"),
        "destinationLocation":  doc.get("destinationLocation"),
        "shipmentType":         doc.get("shipmentType"),
        "customShipmentType":   doc.get("customShipmentType"),
        "transportMode":        doc.get("transportMode"),
        "status":               doc.get("status"),
        "_id":                  doc.get("_id"),
    }


# ── RUN AGENTS ────────────────────────────────────────────────────────────────

@router.post(
    "/intelligence/{doc_id}/run",
    summary="Trigger all agents and compute intelligence for a shipment",
)
async def run_intelligence(
    doc_id: str,
    repo:   SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    """
    Execute the full agent pipeline for a shipment:
      1. Fetch the shipment document
      2. Run all agents with shipment context
      3. Store per-agent outputs in agentData
      4. Aggregate into insights.data
      5. Update system state
      6. Return the intelligence response
    """
    doc = await _get_or_404(doc_id, repo)

    source      = doc.get("sourceLocation", "Mumbai, India")
    destination = doc.get("destinationLocation", "Rotterdam, Netherlands")
    shipment    = doc.get("shipmentType") or doc.get("customShipmentType")
    transport   = doc.get("transportMode")

    # ── Set status to processing ──────────────────────────────────────────
    from db.models import StatusEnum
    await repo.set_status(doc_id, StatusEnum.processing)

    # ── Run orchestrator (synchronous — agents use sync HTTP) ─────────────
    logger.info(f"🚀 Running agent pipeline for doc {doc_id}")

    try:
        result = run_all_agents(
            source_location=source,
            destination_location=destination,
            shipment_type=shipment,
        )
    except Exception as exc:
        logger.error(f"Agent pipeline failed: {exc}", exc_info=True)
        await repo.set_status(doc_id, StatusEnum.failed)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent pipeline error: {exc}",
        )

    # ── Persist per-agent outputs ─────────────────────────────────────────
    agent_outputs = result.get("agent_outputs", {})
    for agent_name, agent_data in agent_outputs.items():
        await repo.patch_agent_data(doc_id, agent_name, agent_data)

    # ── Persist aggregated insights ───────────────────────────────────────
    aggregated = result.get("aggregated", {})
    await repo.patch_insights(doc_id, {
        "type": "agent_intelligence",
        "data": aggregated,
    })

    # ── Update system state ───────────────────────────────────────────────
    await repo.patch_system_state(doc_id, {
        "activeRoute":      f"{source} → {destination}",
        "selectedMode":     transport or "Auto",
        "lastUpdated":      datetime.now(timezone.utc).isoformat(),
        "simulationStatus": "completed",
    })

    # ── Add tracking entry ────────────────────────────────────────────────
    await repo.append_tracking(doc_id, {
        "location":  source,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status":    "intelligence_computed",
        "notes":     f"All {len(agent_outputs)} agents executed. Risk: {aggregated.get('riskScore', 'N/A')}",
    })

    # ── Mark completed ────────────────────────────────────────────────────
    await repo.set_status(doc_id, StatusEnum.completed)

    # ── Return fresh doc ──────────────────────────────────────────────────
    updated_doc = await repo.get_by_id(doc_id)
    return _build_intelligence_response(updated_doc)


# ── GET INTELLIGENCE ──────────────────────────────────────────────────────────

@router.get(
    "/intelligence/{doc_id}",
    summary="Get intelligence data for a shipment",
)
async def get_intelligence(
    doc_id: str,
    repo:   SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    """Return computed intelligence data for a shipment (read-only)."""
    doc = await _get_or_404(doc_id, repo)
    return _build_intelligence_response(doc)


# ── LOOKUP BY ORDER ID ────────────────────────────────────────────────────────

@router.get(
    "/intelligence/order/{order_id}",
    summary="Get intelligence data by order ID",
)
async def get_intelligence_by_order(
    order_id: str,
    repo:     SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    """Lookup intelligence by the human-readable orderId field."""
    doc = await repo.get_by_order_id(order_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No shipment found with orderId '{order_id}'.",
        )
    return _build_intelligence_response(doc)
