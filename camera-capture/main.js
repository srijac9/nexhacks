import { Room, createLocalAudioTrack } from "https://esm.sh/livekit-client";

const logEl = document.getElementById("log");
const log = (s) => {
  logEl.textContent += s + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

let room;
let micTrack;

// ---------------- JOIN ROOM ----------------
document.getElementById("join").onclick = async () => {
  const url = document.getElementById("url").value.trim();
  const roomName = document.getElementById("room").value.trim();
  const name = document.getElementById("name").value.trim();

  log("🔑 requesting token...");

  const resp = await fetch(
    `http://127.0.0.1:3001/token?room=${encodeURIComponent(
      roomName
    )}&name=${encodeURIComponent(name)}`
  );

  if (!resp.ok) {
    const t = await resp.text();
    log(`❌ token request failed (${resp.status}): ${t}`);
    return;
  }

  const { token } = await resp.json();

  room = new Room();
  window.room = room;

  room.on("trackSubscribed", (track) => {
    if (track.kind === "audio") {
      track.attach();
      log("🔊 subscribed to audio");
    }
  });

  room.on("participantConnected", (p) =>
    log(`👤 participant connected: ${p.identity}`)
  );

  await room.connect(url, token);
  log("✅ connected to room");
};

// ---------------- MIC ----------------
document.getElementById("mic").onclick = async () => {
  if (!room) return log("❌ join first");

  if (!micTrack) {
    micTrack = await createLocalAudioTrack();
    await room.localParticipant.publishTrack(micTrack);
    log("🎙️ mic published");
  } else {
    micTrack.stop();
    micTrack = undefined;
    log("🛑 mic stopped");
  }
};

// ---------------- AUTO ANALYZE -> SPEAK ----------------
document.getElementById("analyze").onclick = async () => {
  if (!room) return log("❌ join first");

  const roomName = document.getElementById("room").value.trim();

  log("🧠 running /analyze and sending to agent...");

  const r = await fetch("http://127.0.0.1:8000/analyze-and-speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room: roomName }),
  });

  const t = await r.text();

  if (!r.ok) {
    log(`❌ analyze-and-speak failed (${r.status}): ${t}`);
    return;
  }

  log("✅ analysis sent — agent should speak");
};
