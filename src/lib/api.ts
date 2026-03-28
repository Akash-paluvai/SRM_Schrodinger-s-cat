/**
 * Central FastAPI base URL — used by all Next.js API route handlers
 * that proxy to the Python backend.
 *
 * Set FASTAPI_URL in .env.local for production overrides.
 * Default: http://localhost:8000
 */
export const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
export const API_BASE    = `${FASTAPI_URL}/api/v1`;
