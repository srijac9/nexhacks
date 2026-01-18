import os
import json
from dotenv import load_dotenv
from livekit import api

load_dotenv()

def _api_url_https() -> str:
    api_url = os.getenv("LIVEKIT_API_URL")
    if api_url:
        return api_url

    wss = os.getenv("LIVEKIT_URL")
    if not wss:
        raise RuntimeError("Missing LIVEKIT_URL (or set LIVEKIT_API_URL explicitly)")

    return wss.replace("wss://", "https://").replace("ws://", "http://")

async def send_json_to_room(room: str, payload: dict, topic: str = "lk.chat"):
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    if not api_key or not api_secret:
        raise RuntimeError("Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET")

    lk = api.LiveKitAPI(_api_url_https(), api_key, api_secret)
    try:
        data = json.dumps(payload).encode("utf-8")

        # ✅ DO NOT set kind (your SDK doesn't have DataPacket_Kind)
        req = api.SendDataRequest(
            room=room,
            data=data,
            topic=topic,
        )

        await lk.room.send_data(req)
    finally:
        await lk.aclose()
