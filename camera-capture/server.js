require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { AccessToken } = require("livekit-server-sdk");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOM_NAME = String(process.env.ROOM_NAME || "circuit").trim();

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.static(path.join(__dirname, "public")));

// ---- TOKEN ----
app.get("/token", async (req, res) => {
  try {
    const identity = String(req.query.identity || "").trim();
    if (!identity)
      return res.status(400).json({ error: "missing identity" });

    const url = String(process.env.LIVEKIT_URL || "").trim();
    const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
    const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
    const room = String(process.env.ROOM_NAME || "circuit").trim();

    if (!url.startsWith("wss://")) {
      return res
        .status(500)
        .json({ error: "LIVEKIT_URL must start with wss://" });
    }

    if (!apiKey || !apiSecret) {
      return res
        .status(500)
        .json({ error: "LIVEKIT_API_KEY and SECRET required" });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: 60 * 60,
    });

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: identity === "phone",
      canSubscribe: true,
    });

    const jwt = await at.toJwt();

    res.json({ token: jwt, url, room });
  } catch (e) {
    console.error("token error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ---- UPLOAD (snapshots from laptop viewer) ----
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, __, cb) => cb(null, "latest.jpg"), // overwrite every time
});

const upload = multer({ storage });

app.post("/upload", upload.single("photo"), (req, res) => {
  res.json({ ok: true, savedAs: req.file.filename });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Open phone:  http://localhost:${PORT}/phone.html`);
  console.log(`Open laptop: http://localhost:${PORT}/laptop.html`);
});
