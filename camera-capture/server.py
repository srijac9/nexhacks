from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
import os
from pathlib import Path
from datetime import datetime
import logging
import whisper
import glob

# Import schematic processing router
from process_schematic import router as process_schematic_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Circuit Tutor API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include schematic processing router
app.include_router(process_schematic_router)

# Base directory - go up from camera-capture to nexhacks root
BASE_DIR = Path(__file__).parent.parent

# Create uploads directory if it doesn't exist
UPLOAD_DIR = BASE_DIR / "files" / "verbal-input"
TRANSCRIPT_DIR = BASE_DIR / "files" / "transcript"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TRANSCRIPT_DIR, exist_ok=True)

logger.info(f"Audio upload directory: {UPLOAD_DIR}")
logger.info(f"Transcript directory: {TRANSCRIPT_DIR}")

# Load Whisper model (base model for balance between speed and accuracy)
# This will download the model on first run
try:
    model = whisper.load_model("base")
    logger.info("Whisper model loaded successfully")
except Exception as e:
    logger.error(f"Error loading Whisper model: {e}")
    model = None


@app.get("/")
async def root():
    return {"message": "Circuit Tutor API is running", "routes": ["/upload-audio", "/transcript", "/process-schematic", "/docs"]}


def cleanup_old_files(directory: str, pattern: str):
    """Delete all files matching pattern in directory. Only one file should exist at a time."""
    files = glob.glob(os.path.join(directory, pattern))
    for file in files:
        try:
            os.remove(file)
            logger.info(f"Deleted old file: {file}")
        except Exception as e:
            logger.warning(f"Could not delete file {file}: {e}")


@app.post("/upload-audio")
async def upload_audio(audio: UploadFile = File(...)):
    """
    Receive audio file from frontend when user stops speaking for 2 seconds.
    Transcribes the audio and saves it as a text file.
    Only keeps one audio file and one transcript file at a time.
    """
    try:
        logger.info("=" * 50)
        logger.info("UPLOAD-AUDIO ENDPOINT CALLED")
        logger.info(f"Audio filename: {audio.filename}")
        logger.info(f"Content type: {audio.content_type}")
        
        # Validate file type
        if not audio.content_type or not audio.content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Expected audio file.")
        
        # Clean up old audio files (keep only one at a time)
        cleanup_old_files(str(UPLOAD_DIR), "audio_*")
        cleanup_old_files(str(TRANSCRIPT_DIR), "transcript_*.txt")
        
        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        file_extension = audio.filename.split(".")[-1] if "." in audio.filename else "webm"
        filename = f"audio_{timestamp}.{file_extension}"
        # Convert Path object to string for os.path.join
        filepath = str(UPLOAD_DIR / filename)
        
        # Ensure directory exists
        os.makedirs(str(UPLOAD_DIR), exist_ok=True)
        
        # Save the audio file
        content = await audio.read()
        with open(filepath, "wb") as f:
            f.write(content)
            f.flush()  # Ensure data is written to disk
            os.fsync(f.fileno())  # Force write to disk
        
        file_size = len(content)
        logger.info(f"Received audio file: {filename}, size: {file_size} bytes")
        logger.info(f"Saved to: {filepath}")
        
        # Convert to absolute path for Whisper (must be string, not Path object)
        absolute_filepath = os.path.abspath(str(filepath))
        logger.info(f"Absolute filepath: {absolute_filepath}")
        logger.info(f"File exists after save: {os.path.exists(absolute_filepath)}")
        
        # Transcribe audio to text
        transcript_text = ""
        transcript_filename = None
        
        if model is None:
            logger.warning("Whisper model not loaded, skipping transcription")
        else:
            try:
                if not os.path.exists(absolute_filepath):
                    raise FileNotFoundError(f"Audio file not found: {absolute_filepath}")
                
                logger.info("Starting transcription...")
                logger.info(f"Attempting to transcribe: {absolute_filepath}")
                logger.info(f"File size: {os.path.getsize(absolute_filepath)} bytes")
                
                # Check if ffmpeg is available (Whisper requires it)
                import shutil
                ffmpeg_path = shutil.which("ffmpeg")
                if not ffmpeg_path:
                    logger.warning("ffmpeg not found in PATH. Whisper requires ffmpeg to process audio files.")
                    logger.warning("Please install ffmpeg: https://ffmpeg.org/download.html")
                    raise RuntimeError("ffmpeg is required but not found in system PATH. Please install ffmpeg.")
                else:
                    logger.info(f"ffmpeg found at: {ffmpeg_path}")
                
                result = model.transcribe(absolute_filepath, language="en")
                transcript_text = result["text"].strip()
                
                # Save transcript to text file
                transcript_filename = f"transcript_{timestamp}.txt"
                transcript_filepath = str(TRANSCRIPT_DIR / transcript_filename)
                
                with open(transcript_filepath, "w", encoding="utf-8") as f:
                    f.write(transcript_text)
                
                logger.info(f"Transcript saved: {transcript_filename}")
                logger.info(f"Transcript: {transcript_text[:100]}...")  # Log first 100 chars
                
            except Exception as e:
                logger.error(f"Error during transcription: {str(e)}")
                transcript_text = f"Error during transcription: {str(e)}"
        
        return JSONResponse(
            status_code=200,
            content={
                "message": "Audio received and transcribed successfully",
                "filename": filename,
                "size": file_size,
                "timestamp": timestamp,
                "transcript": transcript_text,
                "transcript_filename": transcript_filename
            }
        )
    
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")


@app.get("/transcript")
async def get_transcript():
    """
    Get the current transcript file.
    Returns the most recent transcript if available.
    """
    try:
        transcript_files = glob.glob(os.path.join(TRANSCRIPT_DIR, "transcript_*.txt"))
        if not transcript_files:
            return JSONResponse(
                status_code=404,
                content={"message": "No transcript found"}
            )
        
        # Get the most recent transcript
        latest_transcript = max(transcript_files, key=os.path.getmtime)
        
        with open(latest_transcript, "r", encoding="utf-8") as f:
            transcript_text = f.read()
        
        return JSONResponse(
            status_code=200,
            content={
                "transcript": transcript_text,
                "filename": os.path.basename(latest_transcript)
            }
        )
    except Exception as e:
        logger.error(f"Error retrieving transcript: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving transcript: {str(e)}")


@app.get("/transcript/download")
async def download_transcript():
    """
    Download the current transcript file.
    """
    try:
        transcript_files = glob.glob(os.path.join(TRANSCRIPT_DIR, "transcript_*.txt"))
        if not transcript_files:
            raise HTTPException(status_code=404, detail="No transcript found")
        
        # Get the most recent transcript
        latest_transcript = max(transcript_files, key=os.path.getmtime)
        
        return FileResponse(
            latest_transcript,
            media_type="text/plain",
            filename=os.path.basename(latest_transcript)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading transcript: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error downloading transcript: {str(e)}")


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "whisper_model_loaded": model is not None
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
