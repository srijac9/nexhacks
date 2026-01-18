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
        # danger first
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

    return " ".join(parts).strip()


async def entrypoint(ctx: agents.JobContext):
    print("🚀 entrypoint called", flush=True)
    await ctx.connect()
    print("✅ connected to room:", ctx.room.name, flush=True)

    # LiveKit Inference TTS descriptor (no OpenAI)
    session = AgentSession(
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    )

    agent = Agent(instructions="Speak concise circuit feedback clearly.")

    # Start session (no room_io options)
    await session.start(room=ctx.room, agent=agent)

    await session.say("Voice agent online. Send circuit JSON and I will read it.", allow_interruptions=False)

    async def handle_text(reader: rtc.TextStreamReader, _info):
        try:
            text = await reader.read_all()
            try:
                payload = json.loads(text)
                spoken = json_to_speech(payload)
            except Exception:
                spoken = text  # if they sent plain text

            print("🗣️ speaking:", spoken[:120], "..." if len(spoken) > 120 else "", flush=True)
            await session.say(spoken, allow_interruptions=True)
        except Exception as e:
            print("❌ text handler error:", e, flush=True)

    # Listen for JS sendText(..., {topic:"lk.chat"})
    ctx.room.register_text_stream_handler("lk.chat", handle_text)
    print("👂 listening on topic lk.chat", flush=True)

    while True:
        await asyncio.sleep(1)


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(entrypoint_fnc=entrypoint)
    )
