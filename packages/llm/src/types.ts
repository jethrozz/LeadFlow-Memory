export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatJsonInput = {
  system: string;
  messages: LlmMessage[];
  temperature?: number;
};

export type LlmProvider = {
  chatJson(input: ChatJsonInput): Promise<Record<string, unknown>>;
};
