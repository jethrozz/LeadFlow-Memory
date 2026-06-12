import type { ChatJsonInput, LlmProvider } from "./types.js";

export class FakeLlmProvider implements LlmProvider {
  constructor(private readonly options: { content?: string } = {}) {}

  async chatJson(_input: ChatJsonInput): Promise<Record<string, unknown>> {
    return JSON.parse(this.options.content ?? "{}") as Record<string, unknown>;
  }
}
