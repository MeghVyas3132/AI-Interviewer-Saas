"""
Redis client for session management and caching.
"""

from typing import Any, Optional

import redis.asyncio as redis

from app.core.config import settings


class RedisClient:
    """Redis client wrapper for async operations."""

    def __init__(self) -> None:
        """Initialize Redis client."""
        self.client: Optional[redis.Redis[str]] = None

    async def connect(self) -> None:
        """Establish Redis connection."""
        self.client = await redis.from_url(settings.redis_url, decode_responses=True)

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self.client:
            await self.client.close()

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

    async def delete(self, key: str) -> bool:
        """
        Delete a key from Redis.

        Args:
            key: Redis key

        Returns:
            True if key was deleted
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        result = await self.client.delete(key)
        return result > 0

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
        return response == True or response == b"PONG"

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


# Global Redis client instance
redis_client = RedisClient()
