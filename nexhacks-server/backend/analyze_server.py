from fastapi import FastAPI
from pydantic import BaseModel
from livekit_broadcast import send_json_to_room

app = FastAPI()

class AnalyzeRequest(BaseModel):
    room: str
    # whatever your analyzer needs:
    # image_b64: str | None = None
    # circuit_state: dict | None = None

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    # TODO: replace this with your real analyze.py call
    result = {
        "analysis": {
            "confidence": 0.7,
            "affirmations": [
                "You have connected the power source V1 correctly.",
                "You have connected resistor R1 correctly."
            ],
            "issues": [],
            "next_steps": [],
            "questions": []
        }
    }

    # ✅ broadcast into LiveKit so the agent speaks it
    await send_json_to_room(req.room, result, topic="lk.chat")

    return {"ok": True, "sent_to_room": req.room, "result": result}
