import os
import json
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException, APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

BASE_DIR = Path(__file__).parent
TARGET_PATH = BASE_DIR / "schematic-output" / "schematic.json"
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
    if not p.exists():
        raise HTTPException(status_code=500, detail=f"Missing file: {p}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {p}: {e}")


def load_text(p: Path) -> str:
    if not p.exists():
        raise HTTPException(status_code=500, detail=f"Missing file: {p.name}")
    text = p.read_text(encoding="utf-8").strip()
    if not text:
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
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{ANALYZE_BASE_URL}/analyze")
            if r.status_code >= 400:
                return None
            data = r.json()
            return data.get("analysis") if isinstance(data, dict) else None
    except Exception:
        return None


async def call_openrouter(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not OPENROUTER_API_KEY:
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

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=req)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"OpenRouter error {r.status_code}: {r.text}")

        data = r.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        text = content if isinstance(content, str) else json.dumps(content)

        json_text = extract_first_json_object(text)
        try:
            parsed = json.loads(json_text)
        except Exception:
            raise HTTPException(status_code=502, detail=f"Model did not return valid JSON. First 400 chars:\n{text[:400]}")

        if not isinstance(parsed, dict) or "answer" not in parsed or "actions" not in parsed or "followups" not in parsed:
            raise HTTPException(status_code=502, detail=f"Model returned wrong shape: {parsed}")

        if not isinstance(parsed["actions"], list) or not isinstance(parsed["followups"], list):
            raise HTTPException(status_code=502, detail=f"Model returned wrong types: {parsed}")

        return parsed


# @router.get("/health")
# def health():
#     return {"ok": True, "model": OPENROUTER_MODEL}


# ✅ GET /answer now reads from sample-questions/{id}.txt
# Example: /answer or /answer?id=2
@router.get("/answer")
async def answer_get():
    target = load_json(TARGET_PATH)
    observed = load_json(OBSERVED_PATH)
    question = load_text(QUESTION_PATH)
    analysis = await fetch_latest_analysis_if_configured()

    payload = {
        "userQuestion": question,
        "targetNetlist": target,
        "observedBoard": observed,
        "analysis": analysis,
    }
    result = await call_openrouter(payload)
    ANSWER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ANSWER_OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


# Optional: keep POST /answer for direct questions (useful for later UI)
@router.post("/answer")
async def answer_post(req: AnswerRequest):
    target = req.target or load_json(TARGET_PATH)
    observed = req.observed or load_json(OBSERVED_PATH)
    question = req.question or load_text(QUESTION_PATH)
    analysis = req.analysis or await fetch_latest_analysis_if_configured()

    payload = {
        "userQuestion": question,
        "targetNetlist": target,
        "observedBoard": observed,
        "analysis": analysis,
    }
    result = await call_openrouter(payload)
    ANSWER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ANSWER_OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result
