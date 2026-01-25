require("dotenv").config({ override: true });

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { AccessToken } = require("livekit-server-sdk");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOM_NAME = String(process.env.ROOM_NAME || "circuit").trim();

// Save uploaded images to files/schematic-diagrams (for /upload endpoint)
const uploadsDir = path.join(__dirname, "..", "files", "schematic-diagrams");
fs.mkdirSync(uploadsDir, { recursive: true });

// Save latest snapshots to uploads/latest.jpg (for /upload-latest endpoint)
const uploadsLatestDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsLatestDir, { recursive: true });

// CORS - MUST BE FIRST
app.use(
  cors({
    origin: [
      "http://localhost:8080", 
      "http://localhost:3000", 
      "http://127.0.0.1:3000", 
      "http://127.0.0.1:8080",
      "http://127.0.0.1:5500",
      "http://localhost:5500"
    ],
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

/**
 * ✅ NO-CACHE for latest snapshot (only)
 * This prevents the browser from showing an old cached copy.
 */
app.use((req, res, next) => {
  if (req.path === "/uploads/latest.jpg" || req.path === "/latest.jpg") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

// ---- TOKEN ----
app.get("/token", async (req, res) => {
  try {
    const identity = String(req.query.identity || "").trim();
    if (!identity) return res.status(400).json({ error: "missing identity" });

    const url = String(process.env.LIVEKIT_URL || "").trim();
    const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
    const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
    const room = String(process.env.ROOM_NAME || "circuit").trim();

    console.log("LIVEKIT_URL from env =", JSON.stringify(process.env.LIVEKIT_URL));

    if (!url.startsWith("wss://")) {
      return res.status(500).json({ error: "LIVEKIT_URL must start with wss://" });
    }
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: "LIVEKIT_API_KEY and SECRET required" });
    }

    const at = new AccessToken(apiKey, apiSecret, { identity, ttl: 60 * 60 });

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: identity === "phone",
      canSubscribe: true,
    });

    const jwt = await at.toJwt();

    console.log(`[TOKEN] Generated token for identity="${identity}":`, {
      url,
      room,
      canPublish: identity === "phone",
      canSubscribe: true,
    });

    const response = { token: jwt, url, room };
    console.log(`[TOKEN] Sending response to client`);
    res.json(response);
    console.log(`[TOKEN] Response sent successfully`);
  } catch (e) {
    console.error("token error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ---- UPLOAD (existing - DO NOT BREAK) ----
// Keep your current behavior here exactly.
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Your existing naming logic
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `schematic${ext}`);
  },
});
const upload = multer({ storage });

app.post("/upload", upload.single("photo"), (req, res) => {
  console.log("Upload request received:", {
    method: req.method,
    headers: req.headers["content-type"],
    hasFile: !!req.file,
    body: req.body,
  });

  if (!req.file) {
    console.error("No file in request");
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Your cleanup (unchanged)
  try {
    const files = fs.readdirSync(uploadsDir);
    files.forEach((file) => {
      if (file !== req.file.filename) {
        const filePath = path.join(uploadsDir, file);
        fs.unlinkSync(filePath);
        console.log(`Deleted old file: ${file}`);
      }
    });
  } catch (err) {
    console.error("Error cleaning up old files:", err);
  }

  console.log(`File uploaded: ${req.file.filename} to ${req.file.destination}`);
  res.json({ ok: true, savedAs: req.file.filename });
});

// ---- CHECK FOR NEW AUDIO FILES ----
// Check if a new audio file was uploaded to verbal-input directory
const verbalInputDir = path.join(__dirname, "..", "files", "verbal-input");
fs.mkdirSync(verbalInputDir, { recursive: true });

let lastAudioCheckTime = 0;
let processedAudioFiles = new Set();

app.get("/check-new-audio", (req, res) => {
  try {
    const since = Number(req.query.since || 0);
    let hasNewAudio = false;
    let latestFileTime = since;

    if (fs.existsSync(verbalInputDir)) {
      const files = fs.readdirSync(verbalInputDir);
      for (const file of files) {
        // Check for audio files (webm, wav, mp3, etc.)
        if (file.match(/\.(webm|wav|mp3|ogg|m4a)$/i)) {
          const filePath = path.join(verbalInputDir, file);
          const stats = fs.statSync(filePath);
          const fileTime = stats.mtimeMs;
          
          // If file was modified after 'since' and we haven't processed it
          if (fileTime > since && !processedAudioFiles.has(file)) {
            hasNewAudio = true;
            processedAudioFiles.add(file);
            latestFileTime = Math.max(latestFileTime, fileTime);
            console.log(`[check-new-audio] New audio file detected: ${file} (${new Date(fileTime).toISOString()})`);
          }
        }
      }
    }

    res.json({ 
      hasNewAudio, 
      timestamp: latestFileTime,
      message: hasNewAudio ? "New audio file detected" : "No new audio files"
    });
  } catch (error) {
    console.error("[check-new-audio] Error:", error);
    res.status(500).json({ error: "Failed to check audio files", hasNewAudio: false });
  }
});

// ---- UPLOAD LATEST (new, safe) ----
// Only used by the camera snapshots; overwrites latest.jpg only.
const storageLatest = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsLatestDir),
  filename: (_, __, cb) => cb(null, "latest.jpg"),
});
const uploadLatest = multer({ storage: storageLatest });

app.post("/upload-latest", uploadLatest.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  res.json({
    ok: true,
    savedAs: req.file.filename,
    url: "/uploads/latest.jpg",
  });
});

// ✅ Serve the uploads folder so the browser can GET latest.jpg
app.use("/uploads", express.static(uploadsLatestDir));
// Also serve schematics folder for other uploads
app.use("/schematics", express.static(uploadsDir));

// Static files - MUST be after routes
app.use(express.static(path.join(__dirname, "public")));

// Error handling to prevent server crashes
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  // Don't exit - keep server running
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit - keep server running
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open phone:  http://localhost:${PORT}/phone.html`);
  console.log(`Open laptop: http://localhost:${PORT}/laptop.html`);
  console.log(`Upload endpoint: http://localhost:${PORT}/upload`);
  console.log(`Latest endpoint: http://localhost:${PORT}/upload-latest`);
  console.log(`Latest image: http://localhost:${PORT}/uploads/latest.jpg`);
});

// Handle server errors
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use. Stop the other process or change PORT in .env`);
  } else {
    console.error("❌ Server error:", error);
  }
});
