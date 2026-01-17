import { Tool, SchemaConstraint } from "@leanmcp/core";
import fs from "fs";
import path from "path";

// --- Input Schema ---
class ParseSchematicInput {
  @SchemaConstraint({
    description: "Path to the schematic image to parse",
    minLength: 1
  })
  imagePath!: string;
}

// --- Service ---
export class GeminiSchematicService {
  private apiKey = process.env.GEMINI_API_KEY || "";
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  private outputDir = path.join(process.cwd(), "parsed-schematics");

  private modelName = "gemini-3-flash-preview"; // use Gemini code model for structured output

  
  constructor() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  @Tool({
    description: "Parse a breadboard schematic image into JSON netlist",
    inputClass: ParseSchematicInput
  })
  async parseSchematic(input: ParseSchematicInput) {
    
    const { imagePath } = input;

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found at ${imagePath}`);
    }
    // Load image
    const imageData = fs.readFileSync(imagePath).toString("base64");

    // Gemini prompt
    const prompt = `
      Convert this breadboard schematic into a JSON netlist.
      Include all components (LEDs, resistors, batteries, buttons) with explicit IDs.
      Show which nodes each terminal connects to.
      Only output valid JSON. Do not explain.
    `;

    const response = await fetch(
      `${this.baseUrl}/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          inputMedia: [{ mimeType: "image/png", inlineData: imageData }],
          generationConfig: {
            responseModalities: ["TEXT"]
          }
        })
      }
    );
    console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY);

    const result = await response.json();
    if (!result.candidates || result.candidates.length === 0) {
      console.error("No candidates returned from Gemini");
      return { success: false, error: "No content returned from Gemini" };
    }
    const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;

    // Save parsed JSON to disk
    const filename = `parsed_${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, jsonString || "{}");

    // Return parsed JSON
    console.log("Full Gemini response:", JSON.stringify(result, null, 2));

    return { success: true, filepath, parsed: JSON.parse(jsonString || "{}") };
  }
}
