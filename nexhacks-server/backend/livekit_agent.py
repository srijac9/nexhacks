import json
import asyncio

from livekit import agents, rtc
from livekit.agents.voice import AgentSession, Agent


def json_to_speech(payload: dict) -> str:
    a = payload.get("analysis", payload)

    parts = []

    aff = a.get("affirmations") or []
    if aff:
        parts.append("Good news. " + " ".join(aff[:2]))

    issues = a.get("issues") or []
    if issues:
        order = {"danger": 0, "warn": 1, "info": 2}
        issues = sorted(issues, key=lambda x: order.get(x.get("severity"), 9))
        parts.append(f"I found {len(issues)} issue" + ("" if len(issues) == 1 else "s") + ".")
        for it in issues[:4]:
            name = it.get("id", "item")
            observed = it.get("observed", "")
            expected = it.get("expected", "")
            fix = it.get("fix", "")
            parts.append(f"{name}. {observed} It should be: {expected} Fix: {fix}")
    else:
        parts.append("I don’t see any wiring issues.")

    steps = a.get("next_steps") or []
    if steps:
        parts.append("Next steps: " + " Then, ".join(steps[:3]) + ".")

    qs = a.get("questions") or []
    if qs:
        parts.append("Quick question: " + qs[0])

    return " ".join(parts).strip() or "I received an update, but it was empty."


async def entrypoint(ctx: agents.JobContext):
    print("🚀 entrypoint called", flush=True)
    await ctx.connect()
    print("✅ connected to room:", ctx.room.name, flush=True)

    # LiveKit Inference TTS descriptor (no OpenAI)
    session = AgentSession(
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    )

    agent = Agent(instructions="Speak concise circuit feedback clearly.")
    await session.start(room=ctx.room, agent=agent)

    async def safe_say(text: str):
        try:
            print("🗣️ speaking:", text[:140], "..." if len(text) > 140 else "", flush=True)
            await session.say(text, allow_interruptions=True)
            print("✅ finished speaking", flush=True)
        except Exception as e:
            print("❌ say failed:", e, flush=True)

    # ✅ This matches JS: localParticipant.sendText(..., { topic: "lk.chat" })
    @ctx.room.on("data_received")
    def _on_data(pkt: rtc.DataPacket):
        try:
            topic = getattr(pkt, "topic", None)
            raw = pkt.data.decode("utf-8", errors="ignore")
            print(f"📩 data_received topic={topic!r} bytes={len(pkt.data)} text={raw[:120]!r}", flush=True)

            # if it's our chat topic, speak it
            if topic == "lk.chat":
                try:
                    payload = json.loads(raw)
                    spoken = json_to_speech(payload)
                except Exception:
                    spoken = raw

                asyncio.create_task(safe_say(spoken))
        except Exception as e:
            print("❌ data handler error:", e, flush=True)


    # optional: speak once on startup
    await safe_say("Voice agent online. Send circuit JSON and I will read it.")

    while True:
        await asyncio.sleep(1)


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(entrypoint_fnc=entrypoint)
    )
