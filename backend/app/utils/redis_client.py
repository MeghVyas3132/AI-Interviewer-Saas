"""
Redis client for session management and caching.
Production-optimized with connection pooling and retry logic.
"""

import logging
from typing import Any, Optional, List

import redis.asyncio as redis
from redis.asyncio.connection import ConnectionPool

from app.core.config import settings

logger = logging.getLogger(__name__)


class RedisClient:
    """
    Redis client wrapper with connection pooling and async operations.
    Optimized for production with:
    - Connection pooling (reuse connections)
    - Automatic reconnection
    - Graceful error handling
    """

    def __init__(self) -> None:
        """Initialize Redis client."""
        self.client: Optional[redis.Redis] = None
        self.pool: Optional[ConnectionPool] = None

    async def connect(self) -> None:
        """
        Establish Redis connection with connection pool.
        Connection pool allows reusing connections across requests.
        """
        try:
            # Create connection pool for better performance
            self.pool = ConnectionPool.from_url(
                settings.redis_url,
                max_connections=settings.redis_max_connections,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                retry_on_timeout=True,
                health_check_interval=30,
            )
            self.client = redis.Redis(connection_pool=self.pool)
            
            # Verify connection
            await self.client.ping()
            logger.info(f"Redis connected (pool: {settings.redis_max_connections} connections)")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            raise

    async def disconnect(self) -> None:
        """Close Redis connection and pool."""
        try:
            if self.client:
                await self.client.close()
            if self.pool:
                await self.pool.disconnect()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.warning(f"Error closing Redis: {e}")

    async def set(
        self,
        key: str,
        value: str,
        ex: Optional[int] = None,
    ) -> bool:
        """
        Set a key-value pair in Redis.

        Args:
            key: Redis key
            value: Value to store
            ex: Optional expiration time in seconds

        Returns:
            True if successful
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        await self.client.set(key, value, ex=ex)
        return True

    async def get(self, key: str) -> Optional[str]:
        """
        Get a value from Redis.

        Args:
            key: Redis key

        Returns:
            Value or None if key doesn't exist
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        return await self.client.get(key)

    async def delete(self, *keys: str) -> int:
        """
        Delete one or more keys from Redis.

        Args:
            keys: Redis keys to delete

        Returns:
            Number of keys deleted
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        if not keys:
            return 0
        return await self.client.delete(*keys)

    async def exists(self, key: str) -> bool:
        """
        Check if a key exists in Redis.

        Args:
            key: Redis key

        Returns:
            True if key exists
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        result = await self.client.exists(key)
        return result > 0

    async def ping(self) -> bool:
        """
        Ping Redis to check connectivity.

        Returns:
            True if Redis is responding
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        response = await self.client.ping()
        return response == True or response == b"PONG" or response == "PONG"

    async def incr(self, key: str) -> int:
        """
        Increment a counter in Redis.

        Args:
            key: Redis key

        Returns:
            New counter value
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        return await self.client.incr(key)

    async def expire(self, key: str, time: int) -> bool:
        """
        Set expiration time on a key.

        Args:
            key: Redis key
            time: Expiration time in seconds

        Returns:
            True if expiration was set
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        result = await self.client.expire(key, time)
        return result > 0

    async def setex(self, key: str, time: int, value: str) -> bool:
        """
        Set key with expiration atomically.

        Args:
            key: Redis key
            time: Expiration time in seconds
            value: Value to store

        Returns:
            True if successful
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        await self.client.setex(key, time, value)
        return True

    async def keys(self, pattern: str) -> List[str]:
        """
        Get all keys matching pattern.
        WARNING: Use sparingly in production (O(N) operation).

        Args:
            pattern: Redis key pattern (e.g., "cache:*")

        Returns:
            List of matching keys
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        return await self.client.keys(pattern)

    async def mget(self, *keys: str) -> List[Optional[str]]:
        """
        Get multiple values at once (more efficient than multiple gets).

        Args:
            keys: Redis keys

        Returns:
            List of values (None for missing keys)
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        if not keys:
            return []
        return await self.client.mget(*keys)

    async def pipeline(self):
        """
        Get a pipeline for batching commands.
        Use for multiple operations in a single round-trip.
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        return self.client.pipeline()


# Global Redis client instance
redis_client = RedisClient()
