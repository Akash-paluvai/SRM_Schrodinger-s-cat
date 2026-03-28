"""
db/connection.py
────────────────
Async MongoDB Atlas connection via Motor.
Reads DB_URL from the environment (.env or system env).

Usage
-----
    from db.connection import get_database

    db   = get_database()
    col  = db["SupplyChainRequests"]
"""

import os
from functools import lru_cache

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

load_dotenv()

_DB_URL:  str = os.environ["DB_URL"]          # raises KeyError if missing — fail fast
_DB_NAME: str = os.getenv("DB_NAME", "supply_chain_db")


@lru_cache(maxsize=1)
def _get_client() -> AsyncIOMotorClient:
    """Return a single, cached Motor client (one per process)."""
    return AsyncIOMotorClient(_DB_URL)


def get_database() -> AsyncIOMotorDatabase:
    """Return the Motor database handle."""
    return _get_client()[_DB_NAME]
