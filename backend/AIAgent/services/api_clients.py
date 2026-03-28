"""
API client wrappers for external services.
Centralizes HTTP calls with retry logic, caching, and error handling.
"""

import os
import logging
import time
import requests
from dotenv import load_dotenv
from utils.cache import cache

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

MAX_RETRIES = 3
RETRY_DELAY = 1  # seconds


# ---------------------------------------------------------------------------
# Generic HTTP helper
# ---------------------------------------------------------------------------
def _request_with_retry(url: str, params: dict | None = None,
                        cache_key: str | None = None) -> dict | None:
    """
    Make a GET request with retry logic and optional caching.

    Args:
        url: Request URL.
        params: Query parameters.
        cache_key: If provided, check/store result in cache.

    Returns:
        Parsed JSON response or None on failure.
    """
    # Check cache first
    if cache_key:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.debug(f"Request attempt {attempt}/{MAX_RETRIES}: {url}")
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            if cache_key:
                cache.set(cache_key, data)

            return data

        except requests.exceptions.RequestException as exc:
            logger.warning(f"Request failed (attempt {attempt}): {exc}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    logger.error(f"All {MAX_RETRIES} retries exhausted for {url}")
    return None


# ---------------------------------------------------------------------------
# OpenWeatherMap
# ---------------------------------------------------------------------------
def fetch_weather(lat: float, lon: float) -> dict | None:
    """
    Fetch current weather data from OpenWeatherMap.

    Args:
        lat: Latitude.
        lon: Longitude.

    Returns:
        Weather JSON or None.
    """
    if not OPENWEATHER_API_KEY:
        logger.error("OPENWEATHER_API_KEY not set")
        return None

    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        "lat": lat,
        "lon": lon,
        "appid": OPENWEATHER_API_KEY,
        "units": "metric",
    }
    cache_key = f"weather:{lat}:{lon}"
    return _request_with_retry(url, params, cache_key)


# ---------------------------------------------------------------------------
# NewsAPI
# ---------------------------------------------------------------------------
def fetch_news(query: str = "supply chain OR shipping OR logistics") -> dict | None:
    """
    Fetch news articles from NewsAPI.

    Args:
        query: Search query string.

    Returns:
        News JSON or None.
    """
    if not NEWS_API_KEY:
        logger.error("NEWS_API_KEY not set")
        return None

    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": 20,
        "apiKey": NEWS_API_KEY,
    }
    cache_key = f"news:{query}"
    return _request_with_retry(url, params, cache_key)


# ---------------------------------------------------------------------------
# TomTom Traffic
# ---------------------------------------------------------------------------
def fetch_traffic(lat: float, lon: float) -> dict | None:
    """
    Fetch traffic flow data from TomTom API.

    Args:
        lat: Latitude of the point.
        lon: Longitude of the point.

    Returns:
        Traffic flow JSON or None.
    """
    if not TOMTOM_API_KEY:
        logger.error("TOMTOM_API_KEY not set")
        return None

    url = (
        f"https://api.tomtom.com/traffic/services/4/flowSegmentData"
        f"/absolute/10/json"
    )
    params = {
        "point": f"{lat},{lon}",
        "key": TOMTOM_API_KEY,
        "unit": "KMPH",
    }
    cache_key = f"traffic:{lat}:{lon}"
    return _request_with_retry(url, params, cache_key)
