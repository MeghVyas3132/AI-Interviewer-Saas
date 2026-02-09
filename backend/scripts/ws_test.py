#!/usr/bin/env python3
import asyncio
import json
import sys

try:
    import websockets
except Exception:
    print("Missing dependency 'websockets'. Please run: pip3 install websockets")
    sys.exit(2)


async def main():
    uri = "ws://localhost:9003"
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as ws:
            print("Connected. Sending ping payload...")
            payload = {"type": "ping", "payload": "hello from ws_test"}
            await ws.send(json.dumps(payload))
            print("Sent. Waiting for response (5s timeout)...")
            try:
                resp = await asyncio.wait_for(ws.recv(), timeout=5)
                print("Received response:", resp)
            except asyncio.TimeoutError:
                print("No response received within timeout.")
    except Exception as e:
        print("WebSocket error:", str(e))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
