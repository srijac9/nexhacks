from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from livekit_broadcast import send_json_to_room
from analyze import analyze as run_analyze  # reuse your existing analyze endpoint

router = APIRouter()

class SpeakRequest(BaseModel):
    room: str

@router.post("/analyze-and-speak")
async def analyze_and_speak(req: SpeakRequest):
    """
    Runs the existing /analyze logic and sends the result
    directly into the LiveKit room for the agent to speak.
    """
    try:
        # This returns: { "analysis": { ... } }
        result = await run_analyze()

        # Broadcast exactly what analyze produces
        await send_json_to_room(
            room=req.room,
            payload=result,
            topic="lk.chat"
        )

        return {
            "ok": True,
            "sent_to_room": req.room,
            "result": result,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"analyze-and-speak failed: {type(e).__name__}: {e}"
        )
