import fs from "fs";
import process from "process";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var.");

const ai = new GoogleGenAI({ apiKey });

const imagePath = process.argv[2];
if (!imagePath) throw new Error("Usage: node schematic_to_netlist.mjs path/to/schematic.png");

const lower = imagePath.toLowerCase();
const mimeType =
  lower.endsWith(".png") ? "image/png" :
  (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) ? "image/jpeg" :
  lower.endsWith(".webp") ? "image/webp" :
  (() => { throw new Error("Unsupported image type. Use png/jpg/webp."); })();

const base64 = fs.readFileSync(imagePath).toString("base64");

const prompt = `You are a schematic-to-netlist transcriber.

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
Create abstract nodes N1, N2, N3... for each electrically distinct node.
Wires connecting points = same node.
Crossing lines without a junction dot are NOT connected.
Junction dots mean connected.
Use component IDs shown (R1, R2, LED1, V1). If not shown, create them.
If a value is unknown, use "".
If polarity is inferable, include the polarity field.
Return JSON only. No markdown. No commentary.`;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodes: { type: "array", items: { type: "string" } },
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: [
              "resistor","led","source","capacitor","diode",
              "switch","transistor","ic","wire","unknown"
            ]
          },
          value: { type: "string" },
          pins: { type: "array", items: { type: "string" } },
          polarity: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: { anode: { type: "string" }, cathode: { type: "string" } },
                required: ["anode", "cathode"]
              },
              {
                type: "object",
                additionalProperties: false,
                properties: { positive: { type: "string" }, negative: { type: "string" } },
                required: ["positive", "negative"]
              }
            ]
          }
        },
        required: ["id", "type", "value", "pins"]
      }
    },
    labels: { type: "object", additionalProperties: { type: "string" } }
  },
  required: ["nodes", "components", "labels"]
};

const resp = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64 } }
      ]
    }
  ],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema
  }
});

const jsonText = resp.text;

let obj;
try {
  obj = JSON.parse(jsonText);
} catch {
  console.error("Model did not return valid JSON. Raw output:\n");
  console.error(jsonText);
  process.exit(1);
}

console.log(JSON.stringify(obj, null, 2));
