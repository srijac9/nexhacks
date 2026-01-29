import os
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException, APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()

BASE_DIR = Path(__file__).parent
# Use a proper Path for the shared schematic-output file
TARGET_PATH = Path(r"C:\Users\srich\nexhacks\files\schematic-output\schematic.json")
OBSERVED_PATH = BASE_DIR / "sample-observed" / "1.json"
QUESTION_PATH = BASE_DIR / "sample-questions" / "1.txt"
ANSWER_OUTPUT_DIR = BASE_DIR / "answer-output"
ANSWER_OUTPUT_PATH = ANSWER_OUTPUT_DIR / "latest.json"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "mistralai/mistral-small-3.1-24b-instruct:free")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "circuit-tutor-answer")

ANALYZE_BASE_URL = os.getenv("ANALYZE_BASE_URL", "").rstrip("/")


def load_json(p: Path) -> Dict[str, Any]:
    logger.info(f"[answer] Loading JSON from {p}")
    if not p.exists():
        logger.error(f"[answer] Missing JSON file: {p}")
        raise HTTPException(status_code=500, detail=f"Missing file: {p}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        logger.exception(f"[answer] Invalid JSON in {p}: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {p}: {e}")


def load_text(p: Path) -> str:
    logger.info(f"[answer] Loading text from {p}")
    if not p.exists():
        logger.error(f"[answer] Missing text file: {p.name}")
        raise HTTPException(status_code=500, detail=f"Missing file: {p.name}")
    text = p.read_text(encoding="utf-8").strip()
    if not text:
        logger.error(f"[answer] Empty text file: {p.name}")
        raise HTTPException(status_code=500, detail=f"Empty file: {p.name}")
    return text



def extract_first_json_object(text: str) -> str:
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return text
    return text[first:last + 1]


class AnswerRequest(BaseModel):
    question: str
    target: Optional[Dict[str, Any]] = None
    observed: Optional[Dict[str, Any]] = None
    analysis: Optional[Dict[str, Any]] = None


SYSTEM_PROMPT = """
You are CircuitTutorAnswerer, an expert electronics lab assistant and breadboard tutor.

You will receive:
- targetNetlist: the intended circuit (abstract nodes N1, N2,...)
- observedBoard: the current breadboard placement (component -> coordinates)
- optional analysis: detected issues/next steps (if available)
- userQuestion: what the user is asking right now

You must answer the user's question.

Requirements:
- Be concise, practical, and safe.
- If the question is about the CURRENT circuit, ground your answer in targetNetlist/observedBoard/analysis.
- If information is missing or ambiguous, ask 1-2 clarifying questions rather than guessing.
- If the question is a GENERAL electronics question, answer normally with clear explanation.
- When giving steps, give the next 1–3 actions, not a long essay.
- Avoid dangerous instructions (e.g., mains wiring). If a question involves high voltage, warn and redirect to safer guidance.

Breadboard assumption (unless told otherwise):
- Coordinates like A10.
- A–E in same row are connected; F–J in same row are connected.
- Center gap separates the halves.

Output format:
Return JSON only:
{
  "answer": string,
  "actions": [
    { "type": "highlight", "locations": string[], "reason": string },
    { "type": "speak", "text": string }
  ],
  "followups": string[]
}

Rules:
- JSON ONLY. No markdown. No extra keys.
- If you are unsure, put clarifying questions into followups.
""".strip()


async def fetch_latest_analysis_if_configured() -> Optional[Dict[str, Any]]:
    if not ANALYZE_BASE_URL:
        return None
    try:
        logger.info(f"[answer] Fetching latest analysis from {ANALYZE_BASE_URL}/analyze")
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{ANALYZE_BASE_URL}/analyze")
            if r.status_code >= 400:
                logger.warning(
                    f"[answer] /analyze returned {r.status_code}, ignoring analysis"
                )
                return None
            data = r.json()
            return data.get("analysis") if isinstance(data, dict) else None
    except Exception as e:
        logger.exception(f"[answer] Failed to fetch analysis: {e}")
        return None


async def call_openrouter(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not OPENROUTER_API_KEY:
        logger.error("[answer] OPENROUTER_API_KEY missing in environment")
        raise HTTPException(status_code=500, detail="Missing OPENROUTER_API_KEY in .env")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_APP_NAME,
    }

    req = {
        "model": OPENROUTER_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
    }

    logger.info(f"[answer] Calling OpenRouter model={OPENROUTER_MODEL}")
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=req,
        )
        if r.status_code >= 400:
            logger.error(
                f"[answer] OpenRouter error {r.status_code}: {r.text[:400]}"
            )
            raise HTTPException(
                status_code=502,
                detail=f"OpenRouter error {r.status_code}: {r.text}",
            )

        data = r.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        text = content if isinstance(content, str) else json.dumps(content)

        json_text = extract_first_json_object(text)
        try:
            parsed = json.loads(json_text)
        except Exception as e:
            logger.exception(
                f"[answer] Failed to parse model JSON. First 400 chars: {text[:400]}"
            )
            raise HTTPException(
                status_code=502,
                detail=f"Model did not return valid JSON. First 400 chars:\n{text[:400]}",
            )

        if not isinstance(parsed, dict) or "answer" not in parsed or "actions" not in parsed or "followups" not in parsed:
            logger.error(f"[answer] Model returned wrong shape: {parsed}")
            raise HTTPException(
                status_code=502,
                detail=f"Model returned wrong shape: {parsed}",
            )

        if not isinstance(parsed["actions"], list) or not isinstance(parsed["followups"], list):
            logger.error(f"[answer] Model returned wrong types: {parsed}")
            raise HTTPException(
                status_code=502,
                detail=f"Model returned wrong types: {parsed}",
            )

        logger.info("[answer] OpenRouter call succeeded")
        return parsed


# @router.get("/health")
# def health():
#     return {"ok": True, "model": OPENROUTER_MODEL}


# ✅ GET /answer now reads from sample-questions/{id}.txt
# Example: /answer or /answer?id=2
@router.get("/answer")
async def answer_get():
    logger.info("[answer] GET /answer called")
    try:
        target = load_json(TARGET_PATH)
        observed = load_json(OBSERVED_PATH)
        question = load_text(QUESTION_PATH)
        logger.info(
            f"[answer] Using question from {QUESTION_PATH.name}: {question[:120]!r}"
        )
        analysis = await fetch_latest_analysis_if_configured()

        payload = {
            "userQuestion": question,
            "targetNetlist": target,
            "observedBoard": observed,
            "analysis": analysis,
        }
        logger.info(
            "[answer] Built payload for OpenRouter "
            f"(target keys={list(target.keys())}, observed keys={list(observed.keys())})"
        )
        result = await call_openrouter(payload)
        ANSWER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ANSWER_OUTPUT_PATH.write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
        logger.info(f"[answer] Wrote answer JSON to {ANSWER_OUTPUT_PATH}")
        return result
    except HTTPException as e:
        logger.error(f"[answer] HTTPException in GET /answer: {e.status_code} {e.detail}")
        raise
    except Exception as e:
        logger.exception(f"[answer] Unhandled error in GET /answer: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"answer_get crashed: {type(e).__name__}: {e}",
        )


# Optional: keep POST /answer for direct questions (useful for later UI)
@router.post("/answer")
async def answer_post(req: AnswerRequest):
    logger.info("[answer] POST /answer called")
    try:
        target = req.target or load_json(TARGET_PATH)
        observed = req.observed or load_json(OBSERVED_PATH)
        question = req.question or load_text(QUESTION_PATH)
        logger.info(f"[answer] POST question: {str(question)[:120]!r}")
        analysis = req.analysis or await fetch_latest_analysis_if_configured()

        payload = {
            "userQuestion": question,
            "targetNetlist": target,
            "observedBoard": observed,
            "analysis": analysis,
        }
        result = await call_openrouter(payload)
        ANSWER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ANSWER_OUTPUT_PATH.write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
        logger.info(f"[answer] Wrote answer JSON to {ANSWER_OUTPUT_PATH} (POST)")
        return result
    except HTTPException as e:
        logger.error(f"[answer] HTTPException in POST /answer: {e.status_code} {e.detail}")
        raise
    except Exception as e:
        logger.exception(f"[answer] Unhandled error in POST /answer: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"answer_post crashed: {type(e).__name__}: {e}",
        )
