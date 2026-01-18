from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
import os
from datetime import datetime
import logging
import whisper
import glob

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Audio Recording API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
UPLOAD_DIR = "uploads"
TRANSCRIPT_DIR = "transcripts"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TRANSCRIPT_DIR, exist_ok=True)

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
    return {"message": "Audio Recording API is running"}


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
        # Validate file type
        if not audio.content_type or not audio.content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Expected audio file.")
        
        # Clean up old audio files (keep only one at a time)
        cleanup_old_files(UPLOAD_DIR, "audio_*")
        cleanup_old_files(TRANSCRIPT_DIR, "transcript_*.txt")
        
        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        file_extension = audio.filename.split(".")[-1] if "." in audio.filename else "webm"
        filename = f"audio_{timestamp}.{file_extension}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        
        # Save the audio file
        with open(filepath, "wb") as f:
            content = await audio.read()
            f.write(content)
        
        file_size = len(content)
        logger.info(f"Received audio file: {filename}, size: {file_size} bytes")
        
        # Transcribe audio to text
        transcript_text = ""
        transcript_filename = None
        
        if model is None:
            logger.warning("Whisper model not loaded, skipping transcription")
        else:
            try:
                logger.info("Starting transcription...")
                result = model.transcribe(filepath, language="en")
                transcript_text = result["text"].strip()
                
                # Save transcript to text file
                transcript_filename = f"transcript_{timestamp}.txt"
                transcript_filepath = os.path.join(TRANSCRIPT_DIR, transcript_filename)
                
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
    uvicorn.run(app, host="0.0.0.0", port=8000)

