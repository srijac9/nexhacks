import os
import json
from pathlib import Path
from typing import Any, Dict, List
from dotenv import load_dotenv

import httpx
from fastapi import FastAPI, HTTPException, APIRouter
load_dotenv()

router = APIRouter()

BASE_DIR = Path(__file__).parent
TARGET_PATH = BASE_DIR / "sample-targets"/ "1.json"
OBSERVED_PATH = BASE_DIR / "sample-observed"/ "1.json"

# -------- LLM Config --------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "mistralai/mistral-small-3.1-24b-instruct:free"
)
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "circuit-tutor-skeleton")


def load_json(p: Path):
    if not p.exists():
        raise HTTPException(status_code=500, detail=f"Missing file: {p.name}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {p.name}: {e}")


def extract_first_json_object(text: str) -> str:
    """Defensive extraction in case the model adds extra text."""
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return text
    return text[first : last + 1]


def validate_analysis_shape(obj: Any) -> Dict[str, Any]:
    """
    Minimal validation so your API doesn't crash later.
    You can tighten this over time.
    """
    if not isinstance(obj, dict):
        raise ValueError("Analysis is not a JSON object")

    # Fill defaults if missing
    obj.setdefault("confidence", 0.5)
    obj.setdefault("affirmations", [])
    obj.setdefault("issues", [])
    obj.setdefault("next_steps", [])
    obj.setdefault("questions", [])

    if not isinstance(obj["issues"], list):
        raise ValueError("'issues' must be a list")
    if not isinstance(obj["next_steps"], list):
        raise ValueError("'next_steps' must be a list")
    if not isinstance(obj["affirmations"], list):
        raise ValueError("'affirmations' must be a list")
    if not isinstance(obj["questions"], list):
        raise ValueError("'questions' must be a list")

    return obj


SYSTEM_PROMPT = """
You are CircuitTutorAnalyzer.

You will be given:
1) targetNetlist: intended circuit (abstract nodes N1, N2, ...)
2) observedBoard: what is currently on the breadboard (component -> coordinates)
3) optional board_rules: how breadboards connect

Task:
Compare observedBoard vs targetNetlist and produce a tutoring-style analysis.

Output MUST be valid JSON only with this exact structure:

{
  "confidence": number (0..1),
  "affirmations": string[],
  "issues": [{
    "id": string,  // e.g. R1, LED1, V1
    "type": "missing_component" | "extra_component" | "short" | "open" | "wrong_connection" | "polarity" | "wrong_value" | "multiple components in same hole",
    "severity": "info" | "warn" | "danger",
    "observed": string,
    "expected": string,
    "locations": string[],  // breadboard coords to highlight (e.g. ["A10","B10"])
    "fix": string           // one clear action sentence
  }],
  "next_steps": string[],    // 1..5 ordered steps
  "questions": string[]      // ask only if uncertain
}

Rules:
- JSON ONLY. No markdown. No commentary.
- Do NOT invent components. Only refer to ids that appear in targetNetlist OR observedBoard.
- Do NOT invent coordinates. Only use coordinates that appear in observedBoard.
- Be specific and actionable.
- Safety: if there is a likely short or polarity risk, severity should be "danger".
- If mapping component names is ambiguous (e.g., observed has "resistor" but target has R1/R2), ask a question and lower confidence.
""".strip()


BOARD_RULES = {
    "coordinate_format": "ColumnLetterRowNumber like A10. Columns A-E are left half, F-J are right half.",
    "connectivity": [
        "A-E in the same numbered row are connected together (left node).",
        "F-J in the same numbered row are connected together (right node).",
        "Left and right halves are separated by the center gap (not connected).",
        "Power rails are ignored unless explicitly present in observedBoard."
    ],
}


async def llm_analyze(target: Dict[str, Any], observed: Dict[str, Any]) -> Dict[str, Any]:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing OPENROUTER_API_KEY environment variable")

    payload = {
        "model": OPENROUTER_MODEL,
        "temperature": 0,
        # Some models honor this; if ignored, we still parse defensively.
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "targetNetlist": target,
                        "observedBoard": observed,
                        "board_rules": BOARD_RULES,
                    }
                ),
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_APP_NAME,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"OpenRouter error {r.status_code}: {r.text}")

        data = r.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        if not isinstance(content, str):
            content = json.dumps(content)

        json_text = extract_first_json_object(content)

        try:
            parsed = json.loads(json_text)
        except Exception:
            # Return a helpful error message (and include snippet for debugging)
            snippet = content[:400]
            raise HTTPException(
                status_code=502,
                detail=f"Model did not return valid JSON. First 400 chars:\n{snippet}",
            )

        parsed = validate_analysis_shape(parsed)
        # Optional: include raw model metadata in debug mode
        parsed["_debug"] = {
            "model": OPENROUTER_MODEL,
        }
        return parsed


# @router.get("/health")
# def health():
#     return {"ok": True}


@router.get("/analyze")
async def analyze():
    target = load_json(TARGET_PATH)
    observed = load_json(OBSERVED_PATH)

    analysis = await llm_analyze(target=target, observed=observed)

    # Return analysis only (clean). If you want to include inputs too, uncomment below.
    return {
        "analysis": analysis,
        # "target": target,
        # "observed": observed
    }
