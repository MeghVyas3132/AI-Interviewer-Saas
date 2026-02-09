"""
Redis caching utilities for performance optimization.
Provides decorators and helpers for caching frequently accessed data.
"""

import json
import logging
import hashlib
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, Union
from datetime import timedelta

from app.utils.redis_client import redis_client

logger = logging.getLogger(__name__)

T = TypeVar('T')

# Default cache TTLs
CACHE_TTL_SHORT = 60  # 1 minute
CACHE_TTL_MEDIUM = 300  # 5 minutes
CACHE_TTL_LONG = 3600  # 1 hour
CACHE_TTL_DAY = 86400  # 24 hours


def cache_key(*args, **kwargs) -> str:
    """Generate a consistent cache key from arguments."""
    key_parts = [str(arg) for arg in args]
    key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
    key_string = ":".join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()


async def get_cached(key: str) -> Optional[Any]:
    """
    Get a value from cache.
    
    Args:
        key: Cache key
        
    Returns:
        Cached value or None
    """
    try:
        value = await redis_client.get(key)
        if value:
            return json.loads(value)
    except Exception as e:
        logger.warning(f"Cache get failed for {key}: {e}")
    return None


async def set_cached(key: str, value: Any, ttl: int = CACHE_TTL_MEDIUM) -> bool:
    """
    Set a value in cache.
    
    Args:
        key: Cache key
        value: Value to cache (must be JSON serializable)
        ttl: Time to live in seconds
        
    Returns:
        True if successful
    """
    try:
        json_value = json.dumps(value, default=str)
        await redis_client.set(key, json_value, ex=ttl)
        return True
    except Exception as e:
        logger.warning(f"Cache set failed for {key}: {e}")
    return False


async def invalidate_cache(pattern: str) -> int:
    """
    Invalidate cache entries matching pattern.
    
    Args:
        pattern: Redis key pattern (e.g., "candidates:company:*")
        
    Returns:
        Number of keys deleted
    """
    try:
        if redis_client.client:
            keys = await redis_client.client.keys(pattern)
            if keys:
                return await redis_client.client.delete(*keys)
    except Exception as e:
        logger.warning(f"Cache invalidation failed for {pattern}: {e}")
    return 0


# Cache key prefixes
class CachePrefix:
    """Standard cache key prefixes for different data types."""
    CANDIDATES = "cache:candidates"
    JOBS = "cache:jobs"
    INTERVIEWS = "cache:interviews"
    USERS = "cache:users"
    COMPANIES = "cache:companies"
    REPORTS = "cache:reports"
    STATS = "cache:stats"


async def get_or_set(
    key: str,
    fetch_func: Callable,
    ttl: int = CACHE_TTL_MEDIUM,
    *args,
    **kwargs
) -> Any:
    """
    Get from cache or fetch and cache the result.
    
    Args:
        key: Cache key
        fetch_func: Async function to call if cache miss
        ttl: Cache TTL in seconds
        *args, **kwargs: Arguments for fetch_func
        
    Returns:
        Cached or freshly fetched data
    """
    # Try cache first
    cached = await get_cached(key)
    if cached is not None:
        logger.debug(f"Cache hit: {key}")
        return cached
    
    # Cache miss - fetch data
    logger.debug(f"Cache miss: {key}")
    result = await fetch_func(*args, **kwargs)
    
    # Cache the result
    if result is not None:
        await set_cached(key, result, ttl)
    
    return result


def cached(
    prefix: str,
    ttl: int = CACHE_TTL_MEDIUM,
    key_builder: Optional[Callable] = None
):
    """
    Decorator for caching async function results.
    
    Args:
        prefix: Cache key prefix
        ttl: Cache TTL in seconds
        key_builder: Optional function to build cache key from args
        
    Usage:
        @cached(CachePrefix.CANDIDATES, ttl=300)
        async def get_candidates(company_id: str):
            ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Build cache key
            if key_builder:
                cache_suffix = key_builder(*args, **kwargs)
            else:
                cache_suffix = cache_key(*args, **kwargs)
            
            full_key = f"{prefix}:{cache_suffix}"
            
            # Try cache
            cached_value = await get_cached(full_key)
            if cached_value is not None:
                return cached_value
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Cache result
            if result is not None:
                await set_cached(full_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator


# Helper functions for common cache operations
async def cache_candidate_list(company_id: str, candidates: list, ttl: int = CACHE_TTL_SHORT):
    """Cache candidate list for a company."""
    key = f"{CachePrefix.CANDIDATES}:list:{company_id}"
    await set_cached(key, candidates, ttl)


async def get_cached_candidate_list(company_id: str) -> Optional[list]:
    """Get cached candidate list for a company."""
    key = f"{CachePrefix.CANDIDATES}:list:{company_id}"
    return await get_cached(key)


async def invalidate_candidate_cache(company_id: str):
    """Invalidate all candidate caches for a company."""
    await invalidate_cache(f"{CachePrefix.CANDIDATES}:*:{company_id}*")


async def cache_stats(company_id: str, stats: dict, ttl: int = CACHE_TTL_SHORT):
    """Cache company statistics."""
    key = f"{CachePrefix.STATS}:{company_id}"
    await set_cached(key, stats, ttl)


async def get_cached_stats(company_id: str) -> Optional[dict]:
    """Get cached company statistics."""
    key = f"{CachePrefix.STATS}:{company_id}"
    return await get_cached(key)
