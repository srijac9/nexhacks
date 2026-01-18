require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { AccessToken } = require("livekit-server-sdk");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOM_NAME = String(process.env.ROOM_NAME || "circuit").trim();

// Save uploaded images to files/schematic-diagrams
const uploadsDir = path.join(__dirname, "..", "files", "schematic-diagrams");
fs.mkdirSync(uploadsDir, { recursive: true });

// CORS - MUST BE FIRST
app.use(cors({
  origin: "http://localhost:8080",
  methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  credentials: true,
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

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

// ---- UPLOAD ----
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Always use the same filename to replace the previous file
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `schematic${ext}`);
  },
});

const upload = multer({ storage });

app.post("/upload", upload.single("photo"), (req, res) => {
  console.log("Upload request received:", {
    method: req.method,
    headers: req.headers['content-type'],
    hasFile: !!req.file,
    body: req.body
  });
  
  if (!req.file) {
    console.error("No file in request");
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  // Delete all other files in the directory to keep only one file
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

// Static files - MUST be after routes
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open phone:  http://localhost:${PORT}/phone.html`);
  console.log(`Open laptop: http://localhost:${PORT}/laptop.html`);
  console.log(`Upload endpoint: http://localhost:${PORT}/upload`);
});