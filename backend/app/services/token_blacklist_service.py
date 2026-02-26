"""
Token blacklist service for immediate logout/token revocation.
Implements Redis-based token blacklist with automatic expiration.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.utils.redis_client import redis_client
from app.utils.jwt_helper import verify_token

logger = logging.getLogger(__name__)


class TokenBlacklistService:
    """Service for managing token blacklist."""

    @staticmethod
    async def add_to_blacklist(token: str, expires_in_minutes: int = 15) -> bool:
        """
        Add token to blacklist (for logout).
        Token expires automatically from Redis after TTL.
        
        Args:
            token: JWT token to blacklist
            expires_in_minutes: How long to keep token in blacklist
            
        Returns:
            True if successful, False otherwise
        """
        try:
            payload = verify_token(token)
            if not payload:
                logger.warning("Attempt to blacklist invalid token")
                return False
            
            token_id = payload.get("jti", token[:20])  # Use jti if available, else token prefix
            key = f"token_blacklist:{token_id}"
            
            # Add to blacklist with TTL
            ttl = expires_in_minutes * 60
            await redis_client.setex(key, ttl, "1")
            
            logger.info(f"Token added to blacklist, expires in {ttl}s")
            return True
        except Exception as e:
            logger.error(f"Failed to add token to blacklist: {e}")
            return False

    @staticmethod
    async def is_blacklisted(token: str) -> bool:
        """
        Check if token is blacklisted.
        
        Args:
            token: JWT token to check
            
        Returns:
            True if blacklisted, False otherwise
        """
        try:
            payload = verify_token(token)
            if not payload:
                return False
            
            token_id = payload.get("jti", token[:20])
            key = f"token_blacklist:{token_id}"
            
            exists = await redis_client.exists(key)
            return bool(exists)
        except Exception as e:
            logger.error(f"Failed to check token blacklist: {e}")
            # If Redis fails, assume token is not blacklisted (graceful degradation)
            return False

    @staticmethod
    async def remove_from_blacklist(token: str) -> bool:
        """
        Remove token from blacklist (rarely used).
        
        Args:
            token: JWT token to remove
            
        Returns:
            True if successful, False otherwise
        """
        try:
            payload = verify_token(token)
            if not payload:
                return False
            
            token_id = payload.get("jti", token[:20])
            key = f"token_blacklist:{token_id}"
            
            await redis_client.delete(key)
            logger.info("Token removed from blacklist")
            return True
        except Exception as e:
            logger.error(f"Failed to remove token from blacklist: {e}")
            return False

    @staticmethod
    async def cleanup_expired() -> int:
        """
        Clean up expired blacklist entries (runs periodically).
        Redis handles this automatically, but this can be called for monitoring.
        
        Returns:
            Number of keys deleted
        """
        try:
            pattern = "token_blacklist:*"
            cursor = 0
            deleted = 0
            
            while True:
                cursor, keys = await redis_client.scan(cursor, match=pattern, count=100)
                for key in keys:
                    ttl = await redis_client.ttl(key)
                    if ttl == -1:  # Key has no expiry
                        await redis_client.delete(key)
                        deleted += 1
                
                if cursor == 0:
                    break
            
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} expired blacklist entries")
            return deleted
        except Exception as e:
            logger.error(f"Failed to cleanup blacklist: {e}")
            return 0
