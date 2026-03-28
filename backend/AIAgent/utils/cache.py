"""
In-memory cache with TTL support.
Prevents repeated API calls by caching responses for a configurable duration.
"""

import time
import threading
import logging

logger = logging.getLogger(__name__)


class TTLCache:
    """Thread-safe in-memory cache with time-to-live expiration."""

    def __init__(self, ttl_seconds: int = 300):
        """
        Initialize cache.

        Args:
            ttl_seconds: Time-to-live for cache entries in seconds (default: 5 minutes).
        """
        self._store: dict = {}
        self._timestamps: dict = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds

    def get(self, key: str):
        """
        Retrieve a cached value if it exists and hasn't expired.

        Args:
            key: Cache key.

        Returns:
            Cached value or None if not found / expired.
        """
        with self._lock:
            if key in self._store:
                age = time.time() - self._timestamps[key]
                if age < self._ttl:
                    logger.debug(f"Cache HIT for key: {key}")
                    return self._store[key]
                else:
                    logger.debug(f"Cache EXPIRED for key: {key}")
                    del self._store[key]
                    del self._timestamps[key]
            return None

    def set(self, key: str, value):
        """
        Store a value in the cache.

        Args:
            key: Cache key.
            value: Value to cache.
        """
        with self._lock:
            self._store[key] = value
            self._timestamps[key] = time.time()
            logger.debug(f"Cache SET for key: {key}")

    def clear(self):
        """Clear all cached entries."""
        with self._lock:
            self._store.clear()
            self._timestamps.clear()
            logger.info("Cache cleared")

    def size(self) -> int:
        """Return the number of cached entries."""
        with self._lock:
            return len(self._store)


# Global shared cache instance
cache = TTLCache(ttl_seconds=300)
