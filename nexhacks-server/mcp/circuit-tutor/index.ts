import { Tool, SchemaConstraint } from "@leanmcp/core";
import fs from "fs";
import path from "path";

/**
 * ---------- Input Schemas ----------
 */

class HighlightErrorInput {
  @SchemaConstraint({ description: "Location on the breadboard to highlight", minLength: 1 })
  location!: string;

  @SchemaConstraint({ description: "Reason the connection is incorrect", minLength: 1 })
  reason!: string;
}

class SpeakInput {
  @SchemaConstraint({ description: "Text to speak to the user", minLength: 1 })
  text!: string;
}

class ParseSchematicInput {
  @SchemaConstraint({ description: "Public URL (https://...) or local file path to the schematic image", minLength: 5 })
  imageUrl!: string;

  @SchemaConstraint({ description: "Image mime type", enum: ["image/png", "image/jpeg", "image/webp"] })
  mimeType!: "image/png" | "image/jpeg" | "image/webp";
}

/**
 * ---------- Types ----------
 */

type TargetNetlist = {
  nodes: string[];
  components: Array<{
    id: string;
    type:
      | "resistor"
      | "led"
      | "source"
      | "capacitor"
      | "diode"
      | "switch"
      | "transistor"
      | "ic"
      | "wire"
      | "unknown";
    value: string;
    pins: string[];
    polarity?: { anode: string; cathode: string } | { positive: string; negative: string };
  }>;
  labels: Record<string, string>;
};

function extractFirstJsonObject(raw: string): string {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return raw;
  return raw.slice(first, last + 1);
}

function validateNetlistShape(obj: any): asserts obj is TargetNetlist {
  if (!obj || typeof obj !== "object") throw new Error("Netlist is not an object");
  if (!Array.isArray(obj.nodes)) throw new Error("Netlist missing 'nodes' array");
  if (!Array.isArray(obj.components)) throw new Error("Netlist missing 'components' array");
  if (!obj.labels || typeof obj.labels !== "object") throw new Error("Netlist missing 'labels' object");
}

function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function normalizeBase64(b64: string) {
  // strip any accidental data-url prefix
  const m = b64.match(/^data:[^;]+;base64,(.*)$/);
  let out = m ? m[1] : b64;
  out = out.replace(/\s+/g, "");
  out = out.replace(/-/g, "+").replace(/_/g, "/");
  const pad = out.length % 4;
  if (pad === 2) out += "==";
  else if (pad === 3) out += "=";
  else if (pad === 1) throw new Error("Invalid base64 length");
  return out;
}

async function fileToDataUrl(filePath: string, mimeType: string) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const buf = fs.readFileSync(abs);
  const b64 = normalizeBase64(buf.toString("base64"));
  return `data:${mimeType};base64,${b64}`;
}

/**
 * ---------- Service / Agent ----------
 */

export class CircuitTutorService {
  private targetNetlist: TargetNetlist | null = null;

  @Tool({ description: "Get the current detected breadboard circuit state (from Overshoot later)" })
  async get_circuit_state() {
    return {
      components: {
        "R1 (100 ohm resistor)": ["A10", "B10"],
        "LED1": ["C15", "C17"],
      },
    };
  }

  @Tool({
    description:
      "Parse a schematic IMAGE into a JSON netlist using OpenRouter (nvidia/nemotron-nano-12b-v2-vl:free). Provide a public URL or a local file path. Cached per session.",
    inputClass: ParseSchematicInput,
  })
  async parse_schematic_image(input: ParseSchematicInput) {
    if (this.targetNetlist) return this.targetNetlist;

    const apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

    const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-nano-12b-v2-vl:free";

    const prompt = `
You are a schematic-to-netlist transcriber.

Convert the provided circuit schematic IMAGE into a JSON netlist.

Output MUST be valid JSON only with this exact structure:
{
  "nodes": string[],
  "components": Array<{
    "id": string,
    "type": "resistor" | "led" | "source" | "capacitor" | "diode" | "switch" | "transistor" | "ic" | "wire" | "unknown",
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
`.trim();

    // IMPORTANT:
    // - If imageUrl is http(s), send it directly (provider fetches it).
    // - If imageUrl is local path, read file and send as data URL.
    const imageUrlToSend = isHttpUrl(input.imageUrl)
      ? input.imageUrl
      : await fileToDataUrl(input.imageUrl, input.mimeType);

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost",
        "X-Title": process.env.OPENROUTER_APP_NAME || "mcp-circuit-tutor",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrlToSend } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`OpenRouter parse failed (${resp.status}): ${txt}`);
    }

    const data = await resp.json();

    let raw: any = data?.choices?.[0]?.message?.content ?? "";
    if (Array.isArray(raw)) raw = raw.map((x: any) => x?.text ?? "").join("");

    const jsonText = extractFirstJsonObject(String(raw));

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Model did not return valid JSON. First 300 chars:\n${String(raw).slice(0, 300)}`);
    }

    validateNetlistShape(parsed);

    this.targetNetlist = parsed as TargetNetlist;
    return this.targetNetlist;
  }

  @Tool({ description: "Get cached target schematic netlist JSON (call parse_schematic_image first)." })
  async get_target_schematic() {
    return this.targetNetlist ?? { error: "No target schematic yet. Call parse_schematic_image first." };
  }

  @Tool({ description: "Highlight an error on the breadboard video feed", inputClass: HighlightErrorInput })
  async highlight_error(input: HighlightErrorInput) {
    console.log(`🔴 Highlight ${input.location}: ${input.reason}`);
    return { success: true };
  }

  @Tool({ description: "Speak feedback to the user", inputClass: SpeakInput })
  async speak(input: SpeakInput) {
    console.log(`🗣️ ${input.text}`);
    return { spoken: true };
  }
}
