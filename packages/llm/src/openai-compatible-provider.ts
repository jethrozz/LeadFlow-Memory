import type { ChatJsonInput, LlmProvider } from "./types.js";

export type OpenAiCompatibleProviderOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly options: OpenAiCompatibleProviderOptions) {}

  async chatJson(input: ChatJsonInput): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: input.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: input.system }, ...input.messages],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM response did not include message content");
    }
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error(`LLM response content is not valid JSON: ${content.slice(0, 200)}`);
    }
  }
}
