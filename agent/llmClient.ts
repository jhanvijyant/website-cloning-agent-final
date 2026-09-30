import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type LlmProvider = "anthropic" | "openai" | "gemini";

export class LlmConfigError extends Error { }

function detectProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === "openai" || explicit === "gemini" || explicit === "anthropic") {
    return explicit;
  }
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";

  throw new LlmConfigError(
    "No LLM API key found. Set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in .env.local."
  );
}

export async function completeText(
  system: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const provider = detectProvider();

  if (provider === "anthropic") return callAnthropic(system, userPrompt, maxTokens);
  if (provider === "openai") return callOpenAI(system, userPrompt, maxTokens);
  return callGemini(system, userPrompt, maxTokens);
}

async function callAnthropic(
  system: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function callOpenAI(
  system: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.GCP_API_KEY });
  const response = await client.chat.completions.create({
    model: "gemini-2.5-flashS",
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

async function callGemini(
  system: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

  const models = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
  ];
  let lastError: unknown;

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const model = client.getGenerativeModel({
          model: modelName,
          systemInstruction: system,
          generationConfig: {
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        });

        const result = await withTimeout(
          model.generateContent(userPrompt),
          90_000,
          `Gemini ${modelName} timed out after 90s`
        );
        return result.response.text();
      } catch (err: any) {
        lastError = err;
        const status = err?.status;

        if (status === 404) break;
        if (status !== 503 && status !== 429 && !err.__isTimeout) throw err;

        console.warn(
          `Gemini ${modelName} attempt ${attempt} failed (${status ?? "timeout"}). Retrying...`
        );
        await new Promise((r) => setTimeout(r, attempt * 3000));
      }
    }
  }
  throw lastError;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error(message);
      err.__isTimeout = true;
      reject(err);
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}