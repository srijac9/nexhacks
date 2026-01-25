# # process_observed.py
# import os
# import json
# import base64
# from pathlib import Path
# from typing import Any, Dict
# from dotenv import load_dotenv

# import httpx
# from fastapi import APIRouter, HTTPException

# load_dotenv()
# router = APIRouter()

# BASE_DIR = Path(__file__).parent

# OBSERVED_IMAGE_PATH = BASE_DIR / "sample-states" / "1.png"
# OUTPUT_DIR = BASE_DIR / "observed-output"

# OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
# OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free")
# OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
# OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "circuit-tutor-observed-preprocess")


# # PROMPT = """You are a breadboard state transcriber.

# # You will be given a TOP-DOWN photo of a breadboard circuit.

# # Breadboard orientation:
# # - Numbers increase left to right
# # - Column letters A–E are below the center gap
# # - Column letters F–J are above the center gap
# # - The center trench separates E and F

# # Output MUST be valid JSON only with this exact structure:
# # {
# #   "components": {
# #     "<component_label>": ["<coord1>", "<coord2>"]
# #   }
# # }

# # Coordinate system:
# # - Columns are letters A–J, rows are numbers. Format like "A10".
# # - If a coordinate cannot be read confidently, use "UNKNOWN".
# # - Do NOT guess coordinates.

# # Component labeling:
# # - When in doubt, notice that horizontal components connect same row letters across columns, while vertical components connect same column numbers across rows.
# # - Use labels like: resistor_1, resistor_2, led_1, wire_1, power_1, button_1, unknown_1...
# # - Number in reading order (top-to-bottom, left-to-right).

# # Rules:
# # - Each component MUST have exactly two coordinates (two leads).
# # - JSON ONLY. No markdown. No extra keys.
# # """.strip()

# PROMPT = """You are a breadboard connectivity transcriber.

# You will be given a TOP-DOWN photo of a breadboard circuit.

# Breadboard orientation:
# - Numbers increase left to right
# - Column letters A–E are below the center gap
# - Column letters F–J are above the center gap
# - The center trench separates E and F

# Output MUST be valid JSON only with this exact structure:
# {
#   "nodes": {
#     "<node_label>": ["<component_label>", "<component_label>", ...]
#   }
# }

# Rules:
# - Each node represents an electrically connected junction (where component leads touch or share a bus).
# - Components may connect to multiple nodes.
# - At each node, list ALL connected components.
# - Use labels like: resistor_1, resistor_2, led_1, wire_1, power_1, button_1, unknown_1...
# - Number components in reading order (top-to-bottom, left-to-right).
# - Number nodes in reading order (top-to-bottom, left-to-right).
# - If a connection cannot be determined confidently, omit it. Do NOT guess.
# - JSON ONLY. No markdown. No extra keys.

# Example output:
# {
#   "nodes": {
#     "node_1": ["resistor1_1", "led1_1"],
#     "node_2": ["resistor1_2", "power1_1"],
#     "node_3": ["led1_2", "power_2"]
#   }
# }
# """.strip()



# def guess_mime(p: Path) -> str:
#     ext = p.suffix.lower()
#     if ext == ".png":
#         return "image/png"
#     if ext in [".jpg", ".jpeg"]:
#         return "image/jpeg"
#     if ext == ".webp":
#         return "image/webp"
#     raise HTTPException(status_code=400, detail="Unsupported image type. Use png/jpg/webp.")


# def file_to_data_url(image_path: Path) -> str:
#     if not image_path.exists():
#         raise HTTPException(status_code=500, detail=f"Missing observed image file: {image_path}")
#     mime = guess_mime(image_path)
#     b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
#     return f"data:{mime};base64,{b64}"


# def extract_first_json_object(text: str) -> str:
#     first = text.find("{")
#     last = text.rfind("}")
#     if first == -1 or last == -1 or last <= first:
#         return text
#     return text[first:last + 1]


# def validate_observed(obj: Any) -> Dict[str, Any]:
#     if not isinstance(obj, dict) or "components" not in obj or not isinstance(obj["components"], dict):
#         raise HTTPException(status_code=502, detail="Output must be { 'components': { ... } }")

#     for label, coords in obj["components"].items():
#         if not isinstance(label, str):
#             raise HTTPException(status_code=502, detail="Component labels must be strings")
#         if not (isinstance(coords, list) and len(coords) == 2 and all(isinstance(x, str) for x in coords)):
#             raise HTTPException(status_code=502, detail=f"{label} must map to exactly two string coordinates")

#     return obj


# async def call_openrouter_vision(data_url: str) -> Dict[str, Any]:
#     if not OPENROUTER_API_KEY:
#         raise HTTPException(status_code=500, detail="Missing OPENROUTER_API_KEY in .env")

#     headers = {
#         "Authorization": f"Bearer {OPENROUTER_API_KEY}",
#         "Content-Type": "application/json",
#         "HTTP-Referer": OPENROUTER_SITE_URL,
#         "X-Title": OPENROUTER_APP_NAME,
#     }

#     body = {
#         "model": OPENROUTER_MODEL,
#         "temperature": 0,
#         "response_format": {"type": "json_object"},
#         "messages": [
#             {
#                 "role": "user",
#                 "content": [
#                     {"type": "text", "text": PROMPT},
#                     {"type": "image_url", "image_url": {"url": data_url}},
#                 ],
#             }
#         ],
#     }

#     async with httpx.AsyncClient(timeout=120) as client:
#         r = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body)
#         if r.status_code >= 400:
#             raise HTTPException(status_code=502, detail=f"OpenRouter error {r.status_code}: {r.text}")

#         data = r.json()
#         content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
#         if not isinstance(content, str):
#             content = json.dumps(content)

#         json_text = extract_first_json_object(content)

#         # try:
#         #     obj = json.loads(json_text)
#         # except Exception:
#         #     raise HTTPException(
#         #         status_code=502,
#         #         detail=f"Model did not return valid JSON. First 300 chars:\n{content[:300]}",
#         #     )

#         return json_text


# @router.get("/process-observed2")
# async def process_observed():
#     data_url = file_to_data_url(OBSERVED_IMAGE_PATH)
#     observed = await call_openrouter_vision(data_url)

#     OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
#     out_path = OUTPUT_DIR / "1.json"
#     out_path.write_text(json.dumps(observed, indent=2), encoding="utf-8")

#     return {
#         "image": str(OBSERVED_IMAGE_PATH),
#         "observed": observed,
#         "saved_to": str(out_path),
#     }



# process_observed.py
import os
import json
import base64
from pathlib import Path
from typing import Any, Dict
from dotenv import load_dotenv

import httpx
from fastapi import APIRouter, HTTPException

load_dotenv()
router = APIRouter()

BASE_DIR = Path(__file__).parent

OBSERVED_IMAGE_PATH = BASE_DIR / "sample-states" / "1.png"
OUTPUT_DIR = BASE_DIR / "observed-output"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-3-flash-preview")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "circuit-tutor-observed-preprocess")

# PROMPT = """You are a breadboard connectivity transcriber.

# Given a top-down image of a breadboard circuit, identify all electrical connection nodes. A node is defined as a set of components that are electrically connected at a common point (e.g., same row or column segment). For each node, list the components connected at that point. Use the format:

# node_X: [component_A, component_B, ...]

# Label components clearly (e.g., resistor1, led1, wire1, power1) and distinguish between different instances. Include power rails as components if they are part of a connection. Ignore physical proximity—only include components that are electrically connected.

# Example output for a simple circuit:

# node_1: [power1, resistor1, resistor2]  
# node_2: [resistor1, led1]  
# node_3: [led1, wire1]  
# node_4: [resistor2, wire1, power2]


# Your output should reflect the actual electrical connectivity visible in the image, not just component placement.
# JSON ONLY. No markdown. No extra keys.
# """.strip()

PROMPT = """You are a breadboard connectivity transcriber.

You will be given a TOP-DOWN photo of a breadboard circuit.

Your task:
- Identify all electrically continuous junctions (nodes) on the breadboard.
- Output MUST be valid JSON only. No markdown, no extra text, no commentary.

Connectivity rules:
1. A node represents any electrically connected junction, including:
   - Component leads inserted into the same numbered column.
2. The center trench separates the two sides of the board. Rows do NOT connect across it unless a wire bridges it.
3. Components may connect to multiple nodes if their leads touch multiple junctions.

JSON structure:
{
    "node_1": ["power_1", "resistor_1", "resistor_2"],
    "node_2": ["resistor_1", "led_1"],
    "node_3": ["led_1", "wire_1"],
    "node_4": ["resistor_2", "wire_1", "power_2"]
}

Rules for output:
- List ALL connected components at each node.
- All components shoulf be included in the nodes.
- Number components consistently: resistor_1, resistor_2, led_1, wire_1, power_1, button_1, unknown_1, etc.
- JSON ONLY. No markdown, no text outside JSON. No extra keys.
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


def merge_nodes(raw_nodes: Dict[str, list]) -> Dict[str, list]:
    """Merge overlapping nodes to produce logical connectivity."""
    merged_nodes = []

    for comps in raw_nodes.values():
        found = False
        for m in merged_nodes:
            if set(m) & set(comps):  # overlap
                m.update(comps)
                found = True
                break
        if not found:
            merged_nodes.append(set(comps))

    # Convert sets to sorted lists and assign node labels
    final_nodes = {f"node_{i+1}": sorted(list(m)) for i, m in enumerate(merged_nodes)}
    return final_nodes


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
            raise HTTPException(status_code=502, detail=f"OpenRouter error {r.status_code}: {r.text}")

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

        # # Merge overlapping nodes
        # if "nodes" in obj:
        #     obj["nodes"] = merge_nodes(obj["nodes"])

        return obj


@router.get("/process-observed2")
async def process_observed():
    data_url = file_to_data_url(OBSERVED_IMAGE_PATH)
    observed = await call_openrouter_vision(data_url)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "1.json"
    out_path.write_text(json.dumps(observed, indent=2), encoding="utf-8")

    return {
        "image": str(OBSERVED_IMAGE_PATH),
        "observed": observed,
        "saved_to": str(out_path),
    }
