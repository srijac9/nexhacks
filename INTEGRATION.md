# Integration Guide: Circuit Flow + Camera Capture + Nexhacks Server

This document explains how the three components have been integrated together.

## Project Structure

```
nexhacks/
├── circuit-flow/          # React/TypeScript frontend (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Index.tsx          # Home page with 3D snake game
│   │   │   ├── Portfolio.tsx      # Portfolio page (links to camera views)
│   │   │   ├── PhoneCamera.tsx    # Phone camera publisher (NEW)
│   │   │   └── LaptopViewer.tsx   # Laptop video viewer (NEW)
│   │   └── App.tsx                # Main app with routing
│   ├── vite.config.ts             # Vite config with proxy to Express API
│   └── package.json               # Added livekit-client dependency
│
├── camera-capture/        # Node.js Express backend (LiveKit server)
│   ├── server.js          # Express server with /token and /upload endpoints
│   └── uploads/           # Directory where snapshots are saved
│
└── nexhacks-server/       # Python backend (Future integration)
    └── backend/
```

## What Was Integrated

### 1. Frontend Integration
- **circuit-flow** React app now includes camera capture functionality
- Created `PhoneCamera.tsx` - React component replacing `phone.html`
- Created `LaptopViewer.tsx` - React component replacing `laptop.html`
- Added routes `/phone` and `/laptop` to the React app
- Added camera section to Portfolio page with navigation buttons

### 2. API Integration
- Configured Vite proxy in `vite.config.ts` to route `/token` and `/upload` requests to Express server (port 3000)
- Frontend now communicates with Express backend seamlessly

### 3. Dependencies
- Added `livekit-client` package to `circuit-flow/package.json`
- All existing dependencies maintained

## How to Run

### Step 1: Start the Express Backend (Camera Capture Server)
```bash
cd camera-capture
npm install  # If not already done
# Make sure .env file exists with LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
npm start
```
Server runs on **http://localhost:3000**

### Step 2: Start the React Frontend
```bash
cd circuit-flow
npm install  # If not already done (includes livekit-client)
npm run dev
```
Frontend runs on **http://localhost:8080**

### Step 3: Access the Application
1. **Home**: http://localhost:8080/
2. **Portfolio**: http://localhost:8080/portfolio
3. **Phone Camera**: http://localhost:8080/phone (for mobile device)
4. **Laptop Viewer**: http://localhost:8080/laptop (for laptop/desktop)

## How It Works

1. **Phone Camera Flow**:
   - Open `/phone` on your phone
   - Click "Start Camera" to connect to LiveKit
   - Phone camera stream is published to LiveKit room

2. **Laptop Viewer Flow**:
   - Open `/laptop` on your laptop
   - Click "Connect" to subscribe to the phone's video stream
   - Video is displayed in real-time
   - Every 30 seconds, a snapshot is automatically captured and uploaded to `camera-capture/uploads/latest.jpg`

## Environment Variables

Make sure `camera-capture/.env` contains:
```
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
ROOM_NAME=circuit
PORT=3000
```

## API Endpoints

The Express server (`camera-capture/server.js`) provides:
- `GET /token?identity=phone|laptop` - Get LiveKit access token
- `POST /upload` - Upload image snapshot (multipart/form-data with 'photo' field)

These are automatically proxied by Vite when accessed from the React app.

## Next Steps

1. **Python Backend Integration**: If you have Python backend files to integrate, add them to `nexhacks-server/backend/` and configure additional proxy routes in `vite.config.ts`

2. **Deployment**: 
   - Deploy Express server (camera-capture) to Cloudflare Workers or similar
   - Deploy React app to a static hosting service
   - Update API proxy URLs if needed

3. **Enhanced Features**:
   - Add error handling and retry logic
   - Implement image gallery view
   - Add real-time status indicators
   - Integrate with Python backend for image processing

## Notes

- The original `phone.html` and `laptop.html` files still exist in `camera-capture/public/` but are now replaced by React components
- All styling matches the existing circuit-flow design system
- Camera components use the same `CircuitButton` and `CircuitBackground` components for consistency
