# process_observed.py
import os
import time
import asyncio
import json
import base64
from pathlib import Path
from typing import Any, Dict, Optional
from dotenv import load_dotenv

import httpx
from fastapi import APIRouter, HTTPException, Query

load_dotenv()
router = APIRouter()

BASE_DIR = Path(__file__).parent

OBSERVED_IMAGE_PATH = BASE_DIR.parent.parent / "camera-capture" / "uploads" / "latest.jpg"
OUTPUT_DIR = BASE_DIR / "observed-output"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "circuit-tutor-observed-preprocess")


PROMPT = """You are a breadboard state transcriber.

You will be given a TOP-DOWN photo of a breadboard circuit.

Breadboard orientation:
- Numbers increase left to right
- Column letters A–E are below the center gap
- Column letters F–J are above the center gap
- The center trench separates E and F

Output MUST be valid JSON only with this exact structure:
{
  "components": {
    "<component_label>": ["<coord1>", "<coord2>"]
  }
}

Coordinate system:
- Columns are letters A–J, rows are numbers. Format like "A10".
- If a coordinate cannot be read confidently, use "UNKNOWN".
- Do NOT guess coordinates.

Component labeling:
- When in doubt, notice that horizontal components connect same row letters across columns, while vertical components connect same column numbers across rows.
- Use labels like: resistor_1, resistor_2, led_1, wire_1, power_1, button_1, unknown_1...
- Number in reading order (top-to-bottom, left-to-right).

Rules:
- Each component MUST have exactly two coordinates (two leads).
- JSON ONLY. No markdown. No extra keys.
""".strip()


def guess_mime(p: Path) -> str:
    ext = p.suffix.lower()
    if ext == ".png":
        return "image/png"
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    raise HTTPException(status_code=400, detail="Unsupported image type. Use png/jpg/webp.")


def file_to_data_url(image_path: Path) -> str:
    if not image_path.exists():
        raise HTTPException(status_code=500, detail=f"Missing observed image file: {image_path}")
    mime = guess_mime(image_path)
    b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def extract_first_json_object(text: str) -> str:
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return text
    return text[first:last + 1]


def validate_observed(obj: Any) -> Dict[str, Any]:
    if not isinstance(obj, dict) or "components" not in obj or not isinstance(obj["components"], dict):
        raise HTTPException(status_code=502, detail="Output must be { 'components': { ... } }")

    for label, coords in obj["components"].items():
        if not isinstance(label, str):
            raise HTTPException(status_code=502, detail="Component labels must be strings")
        if not (isinstance(coords, list) and len(coords) == 2 and all(isinstance(x, str) for x in coords)):
            raise HTTPException(status_code=502, detail=f"{label} must map to exactly two string coordinates")

    return obj


async def call_openrouter_vision(data_url: str) -> Dict[str, Any]:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing OPENROUTER_API_KEY in .env")

    print(f"[process-observed] Using OpenRouter model={OPENROUTER_MODEL}")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_APP_NAME,
    }

    body = {
        "model": OPENROUTER_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    }

    async with httpx.AsyncClient(timeout=120) as client:
        for attempt in range(3):
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=body,
            )
            if r.status_code == 429 and attempt < 2:
                delay = 1.5 * (2 ** attempt)
                print(f"[process-observed] OpenRouter 429 rate limit, retrying in {delay}s")
                await asyncio.sleep(delay)
                continue
            if r.status_code >= 400:
                print(f"[process-observed] OpenRouter error {r.status_code}: {r.text}")
                raise HTTPException(status_code=502, detail=f"OpenRouter error {r.status_code}: {r.text}")
            break

        data = r.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not isinstance(content, str):
            content = json.dumps(content)

        json_text = extract_first_json_object(content)

        try:
            obj = json.loads(json_text)
        except Exception:
            raise HTTPException(
                status_code=502,
                detail=f"Model did not return valid JSON. First 300 chars:\n{content[:300]}",
            )

        return validate_observed(obj)


@router.get("/process-observed")
async def process_observed(
    image_path: Optional[str] = Query(
        None,
        description="Optional absolute path to the observed image to process.",
    ),
):
    start_time = time.perf_counter()
    observed_path = Path(image_path) if image_path else OBSERVED_IMAGE_PATH
    print(f"[process-observed] Received request image_path={observed_path}")
    data_url = file_to_data_url(observed_path)
    observed = await call_openrouter_vision(data_url)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "1.json"
    out_path.write_text(json.dumps(observed, indent=2), encoding="utf-8")

    duration_ms = int((time.perf_counter() - start_time) * 1000)
    print(
        f"[process-observed] Saved output to {out_path} in {duration_ms}ms"
    )
    return {
        "image": str(observed_path),
        "observed": observed,
        "saved_to": str(out_path),
    }
