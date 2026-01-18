from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from livekit_broadcast import send_json_to_room
from analyze import load_json, TARGET_PATH, OBSERVED_PATH, llm_analyze

router = APIRouter()

class SpeakRequest(BaseModel):
    room: str

@router.post("/analyze-and-speak")
async def analyze_and_speak(req: SpeakRequest):
    try:
        target = load_json(TARGET_PATH)
        observed = load_json(OBSERVED_PATH)

        analysis = await llm_analyze(target=target, observed=observed)
        payload = {"analysis": analysis}

        await send_json_to_room(req.room, payload, topic="lk.chat")

        return {"ok": True, "sent_to_room": req.room, "result": payload}

    except HTTPException:
        # if analyze.py raises HTTPException, preserve it
        raise
    except Exception as e:
        # ✅ this will show you the real error in /docs instead of plain 500
        raise HTTPException(status_code=500, detail=f"analyze-and-speak failed: {type(e).__name__}: {e}")
