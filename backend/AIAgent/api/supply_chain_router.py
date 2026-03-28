"""
api/supply_chain_router.py
──────────────────────────
FastAPI router — REST endpoints for SupplyChainRequests.

Mount in your FastAPI app:

    from api.supply_chain_router import router as sc_router
    app.include_router(sc_router, prefix="/api/v1", tags=["Supply Chain"])

Endpoints
---------
POST   /supply-chain-requests           — create a new request
GET    /supply-chain-requests           — list (paginated, optional status filter)
GET    /supply-chain-requests/{id}      — fetch single request
PATCH  /supply-chain-requests/{id}      — partial update
DELETE /supply-chain-requests/{id}      — hard delete
PATCH  /supply-chain-requests/{id}/insights — AI engine writes back insights
PATCH  /supply-chain-requests/{id}/status   — lifecycle transitions
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from db.connection  import get_database
from db.models      import (
    Insights,
    StatusEnum,
    SupplyChainRequestCreate,
    SupplyChainRequestUpdate,
)
from db.repository  import SupplyChainRepository

router = APIRouter()


# ── Dependency ────────────────────────────────────────────────────────────────

def get_repo() -> SupplyChainRepository:
    """FastAPI dependency — injects repository with live DB handle."""
    return SupplyChainRepository(get_database())


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_or_404(doc_id: str, repo: SupplyChainRepository) -> Dict[str, Any]:
    doc = await repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SupplyChainRequest '{doc_id}' not found.",
        )
    return doc


# ── CREATE ────────────────────────────────────────────────────────────────────

@router.post(
    "/supply-chain-requests",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new supply chain request",
)
async def create_request(
    payload: SupplyChainRequestCreate,
    repo:    SupplyChainRepository = Depends(get_repo),
) -> Dict[str, str]:
    inserted_id = await repo.create(payload)
    return {"id": inserted_id, "message": "Supply chain request created successfully."}


# ── LIST ──────────────────────────────────────────────────────────────────────

@router.get(
    "/supply-chain-requests",
    summary="List supply chain requests (paginated)",
)
async def list_requests(
    skip:   int           = Query(default=0,    ge=0),
    limit:  int           = Query(default=20,   ge=1, le=100),
    status: Optional[str] = Query(default=None, description="Filter by status"),
    repo:   SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    docs  = await repo.list_all(skip=skip, limit=limit, status=status)
    total = await repo.count(status=status)
    return {"total": total, "skip": skip, "limit": limit, "data": docs}


# ── READ ──────────────────────────────────────────────────────────────────────

@router.get(
    "/supply-chain-requests/{doc_id}",
    summary="Get a single supply chain request",
)
async def get_request(
    doc_id: str,
    repo:   SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    return await _get_or_404(doc_id, repo)


# ── UPDATE (PATCH) ────────────────────────────────────────────────────────────

@router.patch(
    "/supply-chain-requests/{doc_id}",
    summary="Partially update a supply chain request",
)
async def update_request(
    doc_id:  str,
    payload: SupplyChainRequestUpdate,
    repo:    SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    await _get_or_404(doc_id, repo)          # ensure exists
    modified = await repo.update(doc_id, payload)
    if not modified:
        raise HTTPException(
            status_code=status.HTTP_304_NOT_MODIFIED,
            detail="No changes applied.",
        )
    return await repo.get_by_id(doc_id)


# ── DELETE ────────────────────────────────────────────────────────────────────

@router.delete(
    "/supply-chain-requests/{doc_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a supply chain request",
)
async def delete_request(
    doc_id: str,
    repo:   SupplyChainRepository = Depends(get_repo),
) -> Dict[str, str]:
    await _get_or_404(doc_id, repo)
    deleted = await repo.delete(doc_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return {"message": f"Document '{doc_id}' deleted."}


# ── PATCH INSIGHTS (AI write-back) ────────────────────────────────────────────

@router.patch(
    "/supply-chain-requests/{doc_id}/insights",
    summary="Write AI-generated insights back to a request",
)
async def patch_insights(
    doc_id:   str,
    insights: Insights,
    repo:     SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    await _get_or_404(doc_id, repo)
    await repo.patch_insights(
        doc_id,
        insights.model_dump(by_alias=True, exclude_none=True),
    )
    return await repo.get_by_id(doc_id)


# ── PATCH STATUS (lifecycle) ──────────────────────────────────────────────────

@router.patch(
    "/supply-chain-requests/{doc_id}/status",
    summary="Update the lifecycle status of a request",
)
async def patch_status(
    doc_id: str,
    body:   Dict[str, str],
    repo:   SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    await _get_or_404(doc_id, repo)
    try:
        new_status = StatusEnum(body["status"])
    except (KeyError, ValueError):
        valid = [s.value for s in StatusEnum]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Must be one of: {valid}",
        )
    await repo.set_status(doc_id, new_status)
    return await repo.get_by_id(doc_id)


# ── DASHBOARD STATS ───────────────────────────────────────────────────────────

@router.get(
    "/dashboard",
    summary="Aggregate dashboard statistics from the DB",
)
async def get_dashboard(
    repo: SupplyChainRepository = Depends(get_repo),
) -> Dict[str, Any]:
    """
    Returns live counts + recent shipments (last 10) for the Command Center.
    Static portfolio/trade metrics are returned as fixed values here;
    the frontend may override them.
    """
    total      = await repo.count()
    active     = await repo.count(status="created") + await repo.count(status="processing")
    completed  = await repo.count(status="completed")
    recent_raw = await repo.list_all(skip=0, limit=10)

    status_display = {
        "created":    "IN_TRANSIT",
        "processing": "IN_TRANSIT",
        "completed":  "DELIVERED",
        "failed":     "DELAYED",
    }

    recent = []
    for doc in recent_raw:
        recent.append({
            "id":     doc["_id"],
            "displayId": f"SH-{doc['_id'][-4:].upper()}",
            "route":  f"{doc.get('sourceLocation', '?')} → {doc.get('destinationLocation', '?')}",
            "status": status_display.get(doc.get("status", "created"), "IN_TRANSIT"),
            "mode":   doc.get("transportMode", "Sea"),
            "eta":    (
                doc["deliveryDeadline"].strftime("%Y-%m-%d")
                if doc.get("deliveryDeadline") else "TBD"
            ),
            "cargo":  doc.get("shipmentType", "General"),
            "createdAt": str(doc.get("createdAt", "")),
        })

    return {
        "operations": {
            "totalShipments":       total or 0,
            "activeDeliveries":     active or 0,
            "completedDeliveries":  completed or 0,
        },
        "recentShipments": recent,
    }
