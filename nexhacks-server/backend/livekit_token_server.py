import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from livekit.api import AccessToken, VideoGrants

load_dotenv()

app = FastAPI()

# ✅ allow your frontend (http://127.0.0.1:3000) to call this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/token")
def token(room: str, name: str):
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not api_key or not api_secret:
        return {"error": "Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in .env"}

    at = AccessToken(api_key, api_secret).with_identity(name)
    at.with_grants(VideoGrants(room_join=True, room=room))
    return {"token": at.to_jwt()}
