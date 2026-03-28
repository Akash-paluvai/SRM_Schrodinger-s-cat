"""
db/models.py
────────────
Pydantic v2 models that mirror the SupplyChainRequests MongoDB schema.

These models are used for:
  • Request-body validation  (FastAPI)
  • Response serialisation
  • MongoDB document creation

Collection  : SupplyChainRequests
Database    : supply_chain_db  (override via DB_NAME env var)
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

class PyObjectId(str):
    """Serialisable wrapper around BSON ObjectId."""

    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError(f"Invalid ObjectId: {v}")
        return str(v)


# ─────────────────────────────────────────────
# Enums — controlled vocabulary
# ─────────────────────────────────────────────

class ShipmentTypeEnum(str, Enum):
    raw_materials = "Raw Materials"
    electronics   = "Electronics"
    fmcg          = "FMCG"
    pharma        = "Pharma"
    perishable    = "Perishable"


class TransportModeEnum(str, Enum):
    road        = "Road"
    sea         = "Sea"
    air         = "Air"
    multimodal  = "Multi-modal"


class PriorityLevelEnum(str, Enum):
    low    = "Low"
    medium = "Medium"
    high   = "High"


class RiskToleranceEnum(str, Enum):
    low    = "Low"
    medium = "Medium"
    high   = "High"


class DistributionStrategyEnum(str, Enum):
    full    = "Full"
    partial = "Partial"


class StatusEnum(str, Enum):
    created    = "created"
    processing = "processing"
    completed  = "completed"
    failed     = "failed"


# ─────────────────────────────────────────────
# Sub-documents
# ─────────────────────────────────────────────

class Stop(BaseModel):
    """A single intermediate stop in a multi-stop route."""
    location: str = Field(..., examples=["Singapore"])
    order: int    = Field(..., ge=1, examples=[1])

    model_config = ConfigDict(populate_by_name=True)


class WarehouseConstraints(BaseModel):
    """Preferred warehouse / hub locations."""
    preferred_locations: List[str] = Field(
        default_factory=list,
        alias="preferredLocations",
        examples=[["Dubai Logistics City", "Port Klang"]],
    )

    model_config = ConfigDict(populate_by_name=True)


class SupplierPreferences(BaseModel):
    """Allow-list and block-list of suppliers."""
    preferred_suppliers: List[str] = Field(
        default_factory=list,
        alias="preferredSuppliers",
        examples=[["Supplier A", "Supplier B"]],
    )
    restricted_suppliers: List[str] = Field(
        default_factory=list,
        alias="restrictedSuppliers",
        examples=[["Blacklisted Corp"]],
    )

    model_config = ConfigDict(populate_by_name=True)


class TimeWindow(BaseModel):
    """Allowed operating time window (ISO-8601 strings or HH:MM)."""
    start_time: str = Field(..., alias="startTime", examples=["08:00"])
    end_time:   str = Field(..., alias="endTime",   examples=["18:00"])

    model_config = ConfigDict(populate_by_name=True)


# ─────────────────────────────────────────────
# AI Insights sub-document
# ─────────────────────────────────────────────

class Insights(BaseModel):
    """
    Flexible container for AI-generated insights.

    `type`  — insight category label (e.g. "risk_summary", "route_recommendation")
    `data`  — arbitrary JSON payload from the AI engine; use Dict[str, Any] for
              maximum flexibility without frequent schema migrations.
    """
    type: str = Field(
        default="",
        examples=["risk_summary"],
        description="Category or label of the AI insight.",
    )
    data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Arbitrary AI output payload (free-form JSON).",
    )

    model_config = ConfigDict(populate_by_name=True)


class GeoLocation(BaseModel):
    """GPS coordinates for shipment tracking."""
    lat: float = Field(..., examples=[19.076])
    lng: float = Field(..., examples=[72.8777])

    model_config = ConfigDict(populate_by_name=True)


class TrackingEntry(BaseModel):
    """A single entry in the shipment tracking history."""
    location:  str      = Field(..., examples=["Mumbai Port"])
    timestamp: datetime  = Field(default_factory=datetime.utcnow)
    status:    str      = Field(default="in_transit", examples=["in_transit"])
    notes:     Optional[str] = Field(default=None, examples=["Cleared customs"])

    model_config = ConfigDict(populate_by_name=True)


class AgentDataStore(BaseModel):
    """
    Per-agent output store.
    Each agent writes ONLY to its own key; raw outputs are preserved.
    """
    weather:  Dict[str, Any] = Field(default_factory=dict)
    traffic:  Dict[str, Any] = Field(default_factory=dict)
    demand:   Dict[str, Any] = Field(default_factory=dict)
    news:     Dict[str, Any] = Field(default_factory=dict)
    supplier: Dict[str, Any] = Field(default_factory=dict)
    risk:     Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class SystemState(BaseModel):
    """Routing and simulation state for the shipment."""
    active_route:      Optional[str] = Field(None, alias="activeRoute")
    selected_mode:     Optional[str] = Field(None, alias="selectedMode")
    last_updated:      Optional[datetime] = Field(None, alias="lastUpdated")
    simulation_status: Optional[str] = Field(None, alias="simulationStatus")

    model_config = ConfigDict(populate_by_name=True)



# ─────────────────────────────────────────────
# Main document model
# ─────────────────────────────────────────────

class SupplyChainRequestDocument(BaseModel):
    """
    Full MongoDB document for a SupplyChainRequest.
    Used when reading back from the DB (includes _id).
    """

    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    # ── A. Origin & Destination ──────────────────────────────────────────────
    source_location:      str = Field(..., alias="sourceLocation",      examples=["Mumbai, India"])
    destination_location: str = Field(..., alias="destinationLocation", examples=["Rotterdam, Netherlands"])

    # ── B. Multi-stop Distribution ───────────────────────────────────────────
    stops: List[Stop] = Field(default_factory=list)

    # ── C. Shipment Details ──────────────────────────────────────────────────
    shipment_type:  Optional[ShipmentTypeEnum]  = Field(None, alias="shipmentType")
    quantity:       Optional[str]               = Field(None, examples=["2400 TEU"])
    transport_mode: Optional[TransportModeEnum] = Field(None, alias="transportMode")

    # ── D. Constraints ───────────────────────────────────────────────────────
    delivery_deadline: Optional[datetime]         = Field(None, alias="deliveryDeadline")
    budget:            Optional[float]            = Field(None, ge=0.0, examples=[500000.0])
    priority_level:    Optional[PriorityLevelEnum] = Field(None, alias="priorityLevel")
    risk_tolerance:    Optional[RiskToleranceEnum] = Field(None, alias="riskTolerance")

    # ── E. Distribution & Logistics ──────────────────────────────────────────
    distribution_strategy: Optional[DistributionStrategyEnum] = Field(None, alias="distributionStrategy")
    warehouse_constraints: WarehouseConstraints                = Field(
        default_factory=WarehouseConstraints,
        alias="warehouseConstraints",
    )
    supplier_preferences: SupplierPreferences = Field(
        default_factory=SupplierPreferences,
        alias="supplierPreferences",
    )

    # ── F. Regulatory & Advanced ─────────────────────────────────────────────
    restricted_regions:      List[str]       = Field(default_factory=list, alias="restrictedRegions")
    compliance_requirements: List[str]       = Field(default_factory=list, alias="complianceRequirements")
    time_windows:            List[TimeWindow] = Field(default_factory=list, alias="timeWindows")

    # ── G. AI Insights ───────────────────────────────────────────────────
    insights: Insights = Field(default_factory=Insights)

    # ── H. System Metadata ───────────────────────────────────────────────
    status:     StatusEnum = Field(default=StatusEnum.created)
    created_at: datetime   = Field(default_factory=datetime.utcnow, alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

    # ── I. Order Tracking (NEW — optional, non-breaking) ────────────────
    order_id:             Optional[str]              = Field(None, alias="orderId")
    custom_shipment_type: Optional[str]              = Field(None, alias="customShipmentType")
    current_location:     Optional[GeoLocation]      = Field(None, alias="currentLocation")
    tracking_history:     List[TrackingEntry]         = Field(default_factory=list, alias="trackingHistory")

    # ── J. Agent Data Layer (NEW — optional, non-breaking) ──────────────
    agent_data:           Optional[AgentDataStore]    = Field(None, alias="agentData")

    # ── K. System State (NEW — optional, non-breaking) ──────────────────
    system_state:         Optional[SystemState]       = Field(None, alias="systemState")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )


# ─────────────────────────────────────────────
# Create / Update models (no _id, no auto fields)
# ─────────────────────────────────────────────

class SupplyChainRequestCreate(BaseModel):
    """
    Request body for POST /supply-chain-requests.
    All auto-managed fields (status, createdAt, updatedAt) are excluded.
    """

    # ── A. Origin & Destination ──────────────────────────────────────────────
    source_location:      str = Field(..., alias="sourceLocation",      examples=["Mumbai, India"])
    destination_location: str = Field(..., alias="destinationLocation", examples=["Rotterdam, Netherlands"])

    # ── B. Multi-stop Distribution ───────────────────────────────────────────
    stops: List[Stop] = Field(default_factory=list)

    # ── C. Shipment Details ──────────────────────────────────────────────────
    shipment_type:  Optional[ShipmentTypeEnum]  = Field(None, alias="shipmentType")
    quantity:       Optional[str]               = Field(None, examples=["2400 TEU"])
    transport_mode: Optional[TransportModeEnum] = Field(None, alias="transportMode")

    # ── D. Constraints ───────────────────────────────────────────────────────
    delivery_deadline: Optional[datetime]          = Field(None, alias="deliveryDeadline")
    budget:            Optional[float]             = Field(None, ge=0.0)
    priority_level:    Optional[PriorityLevelEnum] = Field(None, alias="priorityLevel")
    risk_tolerance:    Optional[RiskToleranceEnum] = Field(None, alias="riskTolerance")

    # ── E. Distribution & Logistics ──────────────────────────────────────────
    distribution_strategy: Optional[DistributionStrategyEnum] = Field(None, alias="distributionStrategy")
    warehouse_constraints: WarehouseConstraints = Field(
        default_factory=WarehouseConstraints,
        alias="warehouseConstraints",
    )
    supplier_preferences: SupplierPreferences = Field(
        default_factory=SupplierPreferences,
        alias="supplierPreferences",
    )

    # ── F. Regulatory & Advanced ─────────────────────────────────────────────
    restricted_regions:      List[str]       = Field(default_factory=list, alias="restrictedRegions")
    compliance_requirements: List[str]       = Field(default_factory=list, alias="complianceRequirements")
    time_windows:            List[TimeWindow] = Field(default_factory=list, alias="timeWindows")

    # ── G. AI Insights (optional at creation) ────────────────────────────
    insights: Insights = Field(default_factory=Insights)

    # ── H. Order Tracking (NEW — optional) ──────────────────────────────
    order_id:             Optional[str]              = Field(None, alias="orderId")
    custom_shipment_type: Optional[str]              = Field(None, alias="customShipmentType")
    current_location:     Optional[GeoLocation]      = Field(None, alias="currentLocation")
    tracking_history:     List[TrackingEntry]         = Field(default_factory=list, alias="trackingHistory")
    agent_data:           Optional[AgentDataStore]    = Field(None, alias="agentData")
    system_state:         Optional[SystemState]       = Field(None, alias="systemState")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


class SupplyChainRequestUpdate(BaseModel):
    """
    Request body for PATCH /supply-chain-requests/{id}.
    Every field is optional — only supplied fields are updated.
    """
    source_location:         Optional[str]                              = Field(None, alias="sourceLocation")
    destination_location:    Optional[str]                              = Field(None, alias="destinationLocation")
    stops:                   Optional[List[Stop]]                       = None
    shipment_type:           Optional[ShipmentTypeEnum]                 = Field(None, alias="shipmentType")
    quantity:                Optional[str]                              = None
    transport_mode:          Optional[TransportModeEnum]                = Field(None, alias="transportMode")
    delivery_deadline:       Optional[datetime]                         = Field(None, alias="deliveryDeadline")
    budget:                  Optional[float]                            = Field(None, ge=0.0)
    priority_level:          Optional[PriorityLevelEnum]                = Field(None, alias="priorityLevel")
    risk_tolerance:          Optional[RiskToleranceEnum]                = Field(None, alias="riskTolerance")
    distribution_strategy:   Optional[DistributionStrategyEnum]         = Field(None, alias="distributionStrategy")
    warehouse_constraints:   Optional[WarehouseConstraints]             = Field(None, alias="warehouseConstraints")
    supplier_preferences:    Optional[SupplierPreferences]              = Field(None, alias="supplierPreferences")
    restricted_regions:      Optional[List[str]]                        = Field(None, alias="restrictedRegions")
    compliance_requirements: Optional[List[str]]                        = Field(None, alias="complianceRequirements")
    time_windows:            Optional[List[TimeWindow]]                 = Field(None, alias="timeWindows")
    insights:                Optional[Insights]                         = None
    status:                  Optional[StatusEnum]                       = None

    # ── NEW — optional update fields ────────────────────────────────────
    order_id:                Optional[str]                              = Field(None, alias="orderId")
    custom_shipment_type:    Optional[str]                              = Field(None, alias="customShipmentType")
    current_location:        Optional[GeoLocation]                      = Field(None, alias="currentLocation")
    tracking_history:        Optional[List[TrackingEntry]]              = Field(None, alias="trackingHistory")
    agent_data:              Optional[AgentDataStore]                   = Field(None, alias="agentData")
    system_state:            Optional[SystemState]                      = Field(None, alias="systemState")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
