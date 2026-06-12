import { describe, expect, it } from "vitest";
import { createLlmProviderFromEnv, FakeLlmProvider } from "./index.js";

describe("LLM provider", () => {
  it("returns deterministic fake JSON", async () => {
    const provider = new FakeLlmProvider({
      content: JSON.stringify({ intentLevel: "A", summary: "客户关注渝北三房" }),
    });

    const result = await provider.chatJson({
      system: "Return JSON.",
      messages: [{ role: "user", content: "客户说预算 130 万以内" }],
    });

    expect(result.intentLevel).toBe("A");
  });

  it("creates fake provider from env", () => {
    const provider = createLlmProviderFromEnv({ LLM_PROVIDER: "fake" });
    expect(provider).toBeInstanceOf(FakeLlmProvider);
  });

  it("throws if LLM env is not configured", () => {
    expect(() => createLlmProviderFromEnv({})).toThrow();
  });
});
