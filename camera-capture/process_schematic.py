import os
import json
import base64
import logging
from pathlib import Path
from typing import Any, Dict, Optional
import httpx
from fastapi import FastAPI, HTTPException, Query, APIRouter
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()

# Base directory - go up from camera-capture to nexhacks root
BASE_DIR = Path(__file__).parent.parent

SCHEMATIC_DIR = BASE_DIR / "files" / "schematic-diagrams"
OUTPUT_DIR = BASE_DIR / "files" / "schematic-output"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-5.2-chat")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "circuit-tutor-schematic-preprocess")

PROMPT = """You are a schematic-to-netlist transcriber.
Convert the provided circuit schematic IMAGE into a JSON netlist.

Output MUST be valid JSON only with this exact structure:
{
  "nodes": string[],
  "components": Array<{
    "id": string,
    "type": "resistor" | "led" | "source" | "pushbutton" | "wire" | "unknown",
    "value": string,
    "pins": string[],
    "polarity"?: { "anode": string, "cathode": string } | { "positive": string, "negative": string }
  }>,
  "labels": Record<string,string>
}

Rules:
- Create abstract nodes N1, N2, N3... for each electrically distinct node.
- Wires connecting points = same node.
- Crossing lines without a junction dot are NOT connected.
- Junction dots mean connected.
- Use component IDs shown (R1, R2, LED1, V1). If not shown, create them.
- If a value is unknown, use "".
- If polarity is inferable, include the polarity field.

Return JSON only. No markdown. No commentary.
""".strip()

# Ensure directories exist
SCHEMATIC_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def guess_mime(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".png":
        return "image/png"
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    raise HTTPException(status_code=400, detail="Unsupported image type. Use png/jpg/webp.")


def file_to_data_url(image_path: Path) -> str:
    if not image_path.exists():
        raise HTTPException(status_code=500, detail=f"Missing schematic file: {image_path}")
    mime = guess_mime(image_path)
    b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def extract_first_json_object(text: str) -> str:
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return text
    return text[first:last + 1]


def validate_netlist(obj: Any) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise HTTPException(status_code=502, detail="Netlist is not a JSON object")
    if "nodes" not in obj or not isinstance(obj["nodes"], list):
        raise HTTPException(status_code=502, detail="Netlist missing 'nodes' array")
    if "components" not in obj or not isinstance(obj["components"], list):
        raise HTTPException(status_code=502, detail="Netlist missing 'components' array")
    if "labels" not in obj or not isinstance(obj["labels"], dict):
        raise HTTPException(status_code=502, detail="Netlist missing 'labels' object")
    return obj


async def call_openrouter_vision(data_url: str) -> Dict[str, Any]:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing OPENROUTER_API_KEY in .env")
    
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
        r = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body)
        if r.status_code >= 400:
            error_text = r.text
            try:
                error_json = r.json()
                error_text = json.dumps(error_json, indent=2)
            except:
                pass
            logger.error(f"OpenRouter API error {r.status_code}: {error_text}")
            raise HTTPException(status_code=502, detail=f"OpenRouter error {r.status_code}: {error_text[:500]}")
        
        data = r.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not isinstance(content, str):
            content = json.dumps(content)
        
        json_text = extract_first_json_object(content)
        print(json_text)
        
        try:
            obj = json.loads(json_text)
        except Exception:
            raise HTTPException(status_code=502, detail=f"Model did not return valid JSON. First 300 chars:\n{content[:300]}")
        
        return validate_netlist(obj)


def find_schematic_file() -> Path:
    """Find the schematic file in SCHEMATIC_DIR (looks for schematic.png, schematic.jpg, etc.)"""
    for ext in [".png", ".jpg", ".jpeg", ".webp"]:
        p = SCHEMATIC_DIR / f"schematic{ext}"
        if p.exists():
            return p
    raise HTTPException(status_code=404, detail=f"Missing schematic file in {SCHEMATIC_DIR}. Expected schematic.png, schematic.jpg, etc.")


@router.get("/process-schematic")
async def process_schematic(
    save: bool = Query(True, description="If true, save result to schematic-output/schematic.json"),
):
    """
    Process the schematic diagram from files/schematic-diagrams/schematic.{png|jpg|webp}
    and convert it to a JSON netlist using OpenRouter vision API.
    """
    image_path = find_schematic_file()
    data_url = file_to_data_url(image_path)
    netlist = await call_openrouter_vision(data_url)
    
    if save:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out_path = OUTPUT_DIR / "schematic.json"
        out_path.write_text(json.dumps(netlist, indent=2), encoding="utf-8")
    
    return {"image": image_path.name, "netlist": netlist}


@router.get("/health")
def health():
    return {"ok": True, "model": OPENROUTER_MODEL, "schematic_dir": str(SCHEMATIC_DIR)}
