"""Clear all token blacklist entries from Redis"""
import asyncio
import redis.asyncio as aioredis

async def clear_blacklist():
    # Connect to Redis
    client = aioredis.from_url("redis://localhost:6379", decode_responses=True)
    
    try:
        # Get all blacklist keys
        keys = []
        async for key in client.scan_iter("token_blacklist:*"):
            keys.append(key)
        
        print(f"Found {len(keys)} blacklisted token keys")
        for key in keys:
            print(f"  {key}")
        
        # Delete them
        if keys:
            await client.delete(*keys)
            print(f"Deleted {len(keys)} keys")
        else:
            print("No blacklisted tokens found")
            
    finally:
        await client.close()

asyncio.run(clear_blacklist())
