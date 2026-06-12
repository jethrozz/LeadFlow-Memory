import { FakeLlmProvider } from "./fake-provider.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
import type { LlmProvider } from "./types.js";

export type LlmEnv = {
  LLM_PROVIDER?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
};

export function createLlmProviderFromEnv(env: LlmEnv = process.env): LlmProvider {
  if (env.LLM_PROVIDER === "fake") {
    return new FakeLlmProvider({
      content: JSON.stringify({
        intentLevel: "A",
        summary: "Fake provider response for local tests.",
      }),
    });
  }

  if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
    throw new Error("Set LLM_PROVIDER=fake or provide LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL");
  }

  return new OpenAiCompatibleProvider({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
  });
}
