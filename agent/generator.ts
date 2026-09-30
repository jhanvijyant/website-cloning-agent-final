import type { GeneratedFile, WebsiteAnalysis } from "./types";
import { completeText } from "./llmClient";
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationUserPrompt,
  REPAIR_SYSTEM_PROMPT,
  buildRepairUserPrompt,
} from "./prompts";

export class GenerationError extends Error { }
export async function generateProject(
  analysis: WebsiteAnalysis
): Promise<{ files: GeneratedFile[]; summary: string }> {
  const text = await completeText(
    GENERATION_SYSTEM_PROMPT,
    buildGenerationUserPrompt(analysis),
    8000
  );

  const parsed = safeParseJson<{ files: GeneratedFile[]; summary: string }>(text);
  if (!parsed) {
    console.error("RAW MODEL OUTPUT (first 1500 chars):", text.slice(0, 1500));
    console.error("RAW MODEL OUTPUT (last 500 chars):", text.slice(-500));
  }
  if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new GenerationError(
      "The model did not return a usable set of files. Try again."
    );
  }

  return { files: parsed.files, summary: parsed.summary || "" };
}

// Focused fix for one broken file - used by the validator's retry loop.
export async function repairFile(
  filePath: string,
  content: string,
  errorOutput: string
): Promise<string> {
  const text = await completeText(
    REPAIR_SYSTEM_PROMPT,
    buildRepairUserPrompt(filePath, content, errorOutput),
    4000
  );

  const parsed = safeParseJson<{ content: string }>(text);

  if (!parsed || typeof parsed.content !== "string") {
    throw new GenerationError("The model did not return a usable repair.");
  }

  return parsed.content;
}

function safeParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Fallback: take everything from the first { to the last }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}