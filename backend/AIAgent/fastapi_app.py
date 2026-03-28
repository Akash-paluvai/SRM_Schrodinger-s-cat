"""
fastapi_app.py
──────────────
FastAPI application entry-point for the Supply Chain Decision Intelligence API.

Run locally:
    uvicorn fastapi_app:app --reload --port 8000

Production:
    uvicorn fastapi_app:app --host 0.0.0.0 --port 8000 --workers 4
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from api.supply_chain_router import router as sc_router
from db.connection import get_database

logger = logging.getLogger("fastapi_app")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ping MongoDB Atlas on startup to validate the connection."""
    try:
        db = get_database()
        await db.command("ping")
        logger.info("✅  MongoDB Atlas connected — database: %s", db.name)
    except Exception as exc:
        logger.error("❌  MongoDB Atlas connection failed: %s", exc)
        raise

    yield   # application runs here

    logger.info("🛑  Shutting down — MongoDB connections released.")


# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Supply Chain Decision Intelligence API",
    description=(
        "Production-ready REST API for storing and managing supply chain "
        "requests, constraints, routing preferences, and AI-generated insights."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(sc_router, prefix="/api/v1", tags=["Supply Chain Requests"])


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Meta"])
async def health():
    return {"status": "ok", "service": "supply-chain-api"}
