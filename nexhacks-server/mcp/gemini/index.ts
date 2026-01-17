import { Tool, Resource, SchemaConstraint, Optional } from "@leanmcp/core";
import fs from "fs";
import path from "path";

/**
 * Gemini Image Generation Service (Nano Banana & Nano Banana Pro)
 * 
 * - Nano Banana (gemini-2.5-flash-image): Fast, efficient, 1K resolution
 * - Nano Banana Pro (gemini-3-pro-image-preview): Advanced, up to 4K, thinking mode
 * 
 * Requires GEMINI_API_KEY in environment variables.
 */

// --- Input Schemas ---

class GenerateImageInput {
  @SchemaConstraint({ 
    description: "Text description of the image to generate",
    minLength: 1
  })
  prompt!: string;

  @Optional()
  @SchemaConstraint({ 
    description: "Model to use: nano-banana (fast) or nano-banana-pro (advanced)",
    enum: ["nano-banana", "nano-banana-pro"],
    default: "nano-banana"
  })
  model?: "nano-banana" | "nano-banana-pro";

  @Optional()
  @SchemaConstraint({ 
    description: "Aspect ratio of the output image",
    enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    default: "1:1"
  })
  aspectRatio?: string;

  @Optional()
  @SchemaConstraint({ 
    description: "Image size (only for nano-banana-pro)",
    enum: ["1K", "2K", "4K"],
    default: "1K"
  })
  imageSize?: "1K" | "2K" | "4K";
}

class EditImageInput {
  @SchemaConstraint({ 
    description: "Base64-encoded image data to edit"
  })
  imageBase64!: string;

  @SchemaConstraint({ 
    description: "Text description of the edit to make",
    minLength: 1
  })
  prompt!: string;

  @Optional()
  @SchemaConstraint({ 
    description: "MIME type of the input image",
    enum: ["image/png", "image/jpeg", "image/webp"],
    default: "image/png"
  })
  mimeType?: string;

  @Optional()
  @SchemaConstraint({ 
    description: "Model to use",
    enum: ["nano-banana", "nano-banana-pro"],
    default: "nano-banana"
  })
  model?: "nano-banana" | "nano-banana-pro";

  @Optional()
  @SchemaConstraint({ 
    description: "Aspect ratio of the output image",
    enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    default: "1:1"
  })
  aspectRatio?: string;
}

class StyleTransferInput {
  @SchemaConstraint({ 
    description: "Base64-encoded source image"
  })
  imageBase64!: string;

  @SchemaConstraint({ 
    description: "Target artistic style (e.g., 'Van Gogh Starry Night', 'anime', 'watercolor')",
    minLength: 1
  })
  style!: string;

  @Optional()
  @SchemaConstraint({ 
    description: "Additional instructions for the style transfer"
  })
  instructions?: string;

  @Optional()
  @SchemaConstraint({ 
    description: "MIME type of the input image",
    enum: ["image/png", "image/jpeg", "image/webp"],
    default: "image/png"
  })
  mimeType?: string;
}

// --- Service ---

export class GeminiImageService {
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  private outputDir: string;

  // Model mapping
  private modelMap = {
    "nano-banana": "gemini-2.5-flash-image",
    "nano-banana-pro": "gemini-3-pro-image-preview"
  };

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    if (!this.apiKey) {
      console.warn("[GeminiImageService] GEMINI_API_KEY not set in environment");
    }
    
    // Create output directory for generated images
    this.outputDir = path.join(process.cwd(), "generated-images");
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  @Tool({ 
    description: "Generate an image from text using Gemini (Nano Banana = fast, Nano Banana Pro = advanced with up to 4K)",
    inputClass: GenerateImageInput 
  })
  async generateImage(input: GenerateImageInput) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const modelKey = input.model || "nano-banana";
    const modelName = this.modelMap[modelKey];
    const aspectRatio = input.aspectRatio || "1:1";

    console.log(`[Gemini] Generating image with ${modelKey}: "${input.prompt.substring(0, 50)}..."`);

    // Build generation config
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio
      }
    };

    // Add imageSize for Pro model
    if (modelKey === "nano-banana-pro" && input.imageSize) {
      (generationConfig.imageConfig as Record<string, unknown>).imageSize = input.imageSize;
    }

    const response = await fetch(`${this.baseUrl}/${modelName}:generateContent?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: input.prompt }]
        }],
        generationConfig
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    
    // Extract image from response
    const imageData = this.extractImageFromResponse(result);
    
    if (!imageData) {
      throw new Error("No image data in response");
    }

    // Save image to disk
    const timestamp = Date.now();
    const filename = `gemini_${timestamp}.png`;
    const filepath = path.join(this.outputDir, filename);
    
    const imageBuffer = Buffer.from(imageData, "base64");
    fs.writeFileSync(filepath, imageBuffer);
    console.log(`[Gemini] Image saved to: ${filepath}`);

    return {
      success: true,
      model: modelKey,
      geminiModel: modelName,
      aspectRatio,
      imageSize: input.imageSize || "1K",
      savedTo: filepath,
      filename
    };
  }

  @Tool({ 
    description: "Edit an existing image with text instructions (add elements, remove objects, modify style)",
    inputClass: EditImageInput 
  })
  async editImage(input: EditImageInput) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const modelKey = input.model || "nano-banana";
    const modelName = this.modelMap[modelKey];
    const mimeType = input.mimeType || "image/png";

    console.log(`[Gemini] Editing image: "${input.prompt.substring(0, 50)}..."`);

    // Build generation config
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: input.aspectRatio || "1:1"
      }
    };

    const response = await fetch(`${this.baseUrl}/${modelName}:generateContent?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: input.imageBase64.replace(/^data:[^;]+;base64,/, "")
              }
            },
            { text: input.prompt }
          ]
        }],
        generationConfig
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const imageData = this.extractImageFromResponse(result);
    
    if (!imageData) {
      throw new Error("No image data in response");
    }

    // Save edited image
    const timestamp = Date.now();
    const filename = `gemini_edited_${timestamp}.png`;
    const filepath = path.join(this.outputDir, filename);
    
    const imageBuffer = Buffer.from(imageData, "base64");
    fs.writeFileSync(filepath, imageBuffer);
    console.log(`[Gemini] Edited image saved to: ${filepath}`);

    return {
      success: true,
      model: modelKey,
      geminiModel: modelName,
      savedTo: filepath,
      filename
    };
  }

  @Tool({ 
    description: "Apply artistic style transfer to an image (e.g., Van Gogh, anime, watercolor)",
    inputClass: StyleTransferInput 
  })
  async styleTransfer(input: StyleTransferInput) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const modelName = this.modelMap["nano-banana"];
    const mimeType = input.mimeType || "image/png";

    const stylePrompt = `Transform this image into the artistic style of ${input.style}. ${input.instructions || "Preserve the original composition but render all elements in the new style."}`;

    console.log(`[Gemini] Style transfer to: ${input.style}`);

    const response = await fetch(`${this.baseUrl}/${modelName}:generateContent?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: input.imageBase64.replace(/^data:[^;]+;base64,/, "")
              }
            },
            { text: stylePrompt }
          ]
        }],
        generationConfig: {
          responseModalities: ["IMAGE"]
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const imageData = this.extractImageFromResponse(result);
    
    if (!imageData) {
      throw new Error("No image data in response");
    }

    // Save styled image
    const timestamp = Date.now();
    const styleName = input.style.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 20);
    const filename = `gemini_style_${styleName}_${timestamp}.png`;
    const filepath = path.join(this.outputDir, filename);
    
    const imageBuffer = Buffer.from(imageData, "base64");
    fs.writeFileSync(filepath, imageBuffer);
    console.log(`[Gemini] Styled image saved to: ${filepath}`);

    return {
      success: true,
      style: input.style,
      savedTo: filepath,
      filename
    };
  }

  @Resource({ description: "Gemini API configuration and available models", mimeType: "application/json" })
  getApiStatus() {
    return {
      contents: [{
        uri: "gemini://status",
        mimeType: "application/json",
        text: JSON.stringify({
          configured: !!this.apiKey,
          apiKeySet: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : null,
          models: {
            "nano-banana": {
              geminiModel: "gemini-2.5-flash-image",
              description: "Fast, efficient, 1K resolution",
              maxResolution: "1024x1024",
              bestFor: "High-volume, low-latency tasks"
            },
            "nano-banana-pro": {
              geminiModel: "gemini-3-pro-image-preview", 
              description: "Advanced with thinking mode, up to 4K",
              maxResolution: "4096x4096",
              bestFor: "Professional asset production, complex instructions"
            }
          },
          supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
          imageSizes: ["1K", "2K", "4K"]
        }, null, 2)
      }]
    };
  }

  // Helper: Extract base64 image data from Gemini response
  private extractImageFromResponse(result: Record<string, unknown>): string | null {
    try {
      const candidates = result.candidates as Array<Record<string, unknown>>;
      if (!candidates?.[0]) return null;
      
      const content = candidates[0].content as Record<string, unknown>;
      const parts = content?.parts as Array<Record<string, unknown>>;
      if (!parts) return null;

      // Find the image part (skip thought images)
      for (const part of parts) {
        if (part.thought) continue; // Skip thinking images
        
        const inlineData = (part.inlineData || part.inline_data) as Record<string, unknown> | undefined;
        const data = inlineData;
        
        if (data && typeof data === "object" && "data" in data) {
          return data.data as string;
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }
}