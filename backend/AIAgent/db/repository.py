"""
db/repository.py
────────────────
CRUD operations for the SupplyChainRequests collection.

All methods are async (Motor / asyncio).

Usage
-----
    from db.repository import SupplyChainRepository
    from db.connection  import get_database

    repo = SupplyChainRepository(get_database())

    doc_id = await repo.create(payload)      # returns inserted _id as str
    doc    = await repo.get_by_id(doc_id)    # returns dict | None
    docs   = await repo.list_all(limit=20)   # returns list[dict]
    await repo.update(doc_id, patch)         # partial update
    await repo.delete(doc_id)               # soft or hard delete
"""

from __future__ import annotations

from datetime import datetime
import random
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from db.models import SupplyChainRequestCreate, SupplyChainRequestUpdate, StatusEnum

COLLECTION = "SupplyChainRequests"


class SupplyChainRepository:
    """Thin async repository wrapping the SupplyChainRequests collection."""

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[COLLECTION]

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _to_dict(model, by_alias: bool = True) -> Dict[str, Any]:
        """Pydantic v2 → plain dict, excluding unset Nones."""
        return model.model_dump(by_alias=by_alias, exclude_none=True)

    @staticmethod
    def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
        """Convert ObjectId → str for JSON responses."""
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return doc

    @staticmethod
    def _generate_order_id() -> str:
        """Generate a unique CM-XXXXXX order ID."""
        return f"CM-{random.randint(100000, 999999)}"

    async def ensure_order_id_index(self) -> None:
        """Create a unique sparse index on orderId (idempotent)."""
        await self._col.create_index(
            "orderId", unique=True, sparse=True, name="orderId_unique",
        )

    # ── CREATE ────────────────────────────────────────────────────────────────

    async def create(self, payload: SupplyChainRequestCreate) -> str:
        """
        Insert a new SupplyChainRequest document.
        Injects system metadata (status, createdAt) before insertion.
        Auto-generates orderId if not provided.
        Returns the new document's _id as a string.
        """
        doc = self._to_dict(payload)
        doc.setdefault("status", StatusEnum.created.value)
        doc["createdAt"] = datetime.utcnow()
        doc["updatedAt"] = doc["createdAt"]

        # Auto-generate orderId if missing
        if not doc.get("orderId"):
            for _ in range(10):  # retry up to 10 times for uniqueness
                candidate = self._generate_order_id()
                exists = await self._col.find_one({"orderId": candidate})
                if not exists:
                    doc["orderId"] = candidate
                    break
            else:
                doc["orderId"] = f"CM-{random.randint(100000, 999999)}-{int(datetime.utcnow().timestamp()) % 10000}"

        result = await self._col.insert_one(doc)
        return str(result.inserted_id)

    # ── READ ──────────────────────────────────────────────────────────────────

    async def get_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Return a single document by its _id, or None if not found."""
        if not ObjectId.is_valid(doc_id):
            return None
        doc = await self._col.find_one({"_id": ObjectId(doc_id)})
        return self._serialize(doc) if doc else None

    async def list_all(
        self,
        skip:   int = 0,
        limit:  int = 50,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return a paginated list of documents.
        Optionally filter by status (e.g. "created", "completed").
        """
        query: Dict[str, Any] = {}
        if status:
            query["status"] = status

        cursor = (
            self._col.find(query)
            .sort("createdAt", -1)
            .skip(skip)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return [self._serialize(d) for d in docs]

    # ── UPDATE ────────────────────────────────────────────────────────────────

    async def update(
        self,
        doc_id:  str,
        payload: SupplyChainRequestUpdate,
    ) -> bool:
        """
        Partial update (PATCH semantics).
        Only fields explicitly set in `payload` are written.
        Returns True if a document was modified.
        """
        if not ObjectId.is_valid(doc_id):
            return False

        delta = self._to_dict(payload)
        if not delta:
            return False                    # nothing to update

        delta["updatedAt"] = datetime.utcnow()

        result = await self._col.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": delta},
        )
        return result.modified_count > 0

    async def patch_insights(
        self,
        doc_id:   str,
        insights: Dict[str, Any],
    ) -> bool:
        """
        Convenience method — atomically replace the `insights` sub-document.
        Called by the AI engine after generating its output.
        """
        if not ObjectId.is_valid(doc_id):
            return False

        result = await self._col.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"insights": insights, "updatedAt": datetime.utcnow()}},
        )
        return result.modified_count > 0

    async def set_status(self, doc_id: str, status: StatusEnum) -> bool:
        """Update only the status field (e.g. created → processing → completed)."""
        if not ObjectId.is_valid(doc_id):
            return False

        result = await self._col.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"status": status.value, "updatedAt": datetime.utcnow()}},
        )
        return result.modified_count > 0

    # ── DELETE ────────────────────────────────────────────────────────────────

    async def delete(self, doc_id: str) -> bool:
        """Hard-delete a document. Returns True if deleted."""
        if not ObjectId.is_valid(doc_id):
            return False
        result = await self._col.delete_one({"_id": ObjectId(doc_id)})
        return result.deleted_count > 0

    # ── COUNT ─────────────────────────────────────────────────────────────────

    async def count(self, status: Optional[str] = None) -> int:
        """Return total document count, optionally filtered by status."""
        query: Dict[str, Any] = {}
        if status:
            query["status"] = status
        return await self._col.count_documents(query)

    # ── AGENT DATA (per-agent atomic write) ───────────────────────────────────

    async def patch_agent_data(
        self,
        doc_id: str,
        agent_name: str,
        data: Dict[str, Any],
    ) -> bool:
        """Atomically write a single agent's output into agentData.<name>."""
        if not ObjectId.is_valid(doc_id):
            return False

        result = await self._col.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                f"agentData.{agent_name}": data,
                "updatedAt": datetime.utcnow(),
            }},
        )
        return result.modified_count > 0

    # ── SYSTEM STATE ──────────────────────────────────────────────────────────

    async def patch_system_state(
        self,
        doc_id: str,
        state: Dict[str, Any],
    ) -> bool:
        """Replace the systemState sub-document."""
        if not ObjectId.is_valid(doc_id):
            return False

        result = await self._col.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"systemState": state, "updatedAt": datetime.utcnow()}},
        )
        return result.modified_count > 0

    # ── TRACKING HISTORY ──────────────────────────────────────────────────────

    async def append_tracking(
        self,
        doc_id: str,
        entry: Dict[str, Any],
    ) -> bool:
        """Append a tracking entry to the trackingHistory array."""
        if not ObjectId.is_valid(doc_id):
            return False

        result = await self._col.update_one(
            {"_id": ObjectId(doc_id)},
            {
                "$push": {"trackingHistory": entry},
                "$set":  {"updatedAt": datetime.utcnow()},
            },
        )
        return result.modified_count > 0

    # ── LOOKUP BY ORDER ID ────────────────────────────────────────────────────

    async def get_by_order_id(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Find a single document by its orderId field."""
        doc = await self._col.find_one({"orderId": order_id})
        return self._serialize(doc) if doc else None
