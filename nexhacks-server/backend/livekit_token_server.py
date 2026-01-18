import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from livekit.api import AccessToken, VideoGrants

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/token")
def token(room: str = "nexhacks", name: str = "user"):
    at = AccessToken(os.environ["LIVEKIT_API_KEY"], os.environ["LIVEKIT_API_SECRET"])
    at = at.with_identity(name).with_grants(
        VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True)
    )
    return {"token": at.to_jwt(), "room": room, "name": name}
