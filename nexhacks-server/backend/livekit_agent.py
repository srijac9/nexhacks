import json

from livekit import agents
from livekit.agents import AgentSession, Agent
from livekit.agents.voice import room_io

# Turn your JSON into something speakable
def verbalize(a: dict) -> str:
    parts = []

    aff = (a.get("affirmations") or [])[:2]
    if aff:
        parts.append("Nice work. " + " ".join(aff))

    issues = a.get("issues") or []
    if not issues:
        parts.append("I don’t see any wiring issues.")
    else:
        order = {"danger": 0, "warn": 1, "info": 2}
        issues = sorted(issues, key=lambda x: order.get(x.get("severity"), 9))
        parts.append(f"I found {len(issues)} issue" + ("" if len(issues) == 1 else "s") + ".")
        for i in issues:
            msg = f"{i.get('id','Item')}. {i.get('observed','')} It should be: {i.get('expected','')}."
            if i.get("fix"):
                msg += " " + i["fix"]
            parts.append(msg)

    steps = (a.get("next_steps") or [])[:3]
    if steps:
        parts.append("Next steps: " + " Then, ".join(steps) + ".")

    q = (a.get("questions") or [])
    if q:
        parts.append(q[0])

    return " ".join(parts)

def on_text(session: AgentSession, event: room_io.TextInputEvent) -> None:
    try:
        payload = json.loads(event.text)
        analysis = payload.get("analysis", payload)
        text = verbalize(analysis)
    except Exception:
        text = "I got a message, but it wasn’t valid JSON. Send the analysis JSON and I’ll read it aloud."

    session.say(text, allow_interruptions=True)

async def entrypoint(ctx: agents.JobContext):
    # Connect the agent to the LiveKit room
    await ctx.connect()

    # LiveKit Inference TTS: pick any supported TTS descriptor.
    # This Cartesia model string is straight from LiveKit docs.
    session = AgentSession(
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    )

    await session.start(
        room=ctx.room,
        agent=Agent(instructions="You read circuit feedback aloud."),
        room_options=room_io.RoomOptions(
            text_input=room_io.TextInputOptions(text_input_cb=on_text),
            audio_input=False,
        ),
    )

    await session.say("Voice agent online. Send circuit JSON and I will read it.", allow_interruptions=False)

if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
