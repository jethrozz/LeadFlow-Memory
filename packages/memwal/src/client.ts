import type {
  LeadMemory,
  MemWalClient,
  RecallMemoryInput,
  WriteMemoryInput,
} from "./types.js";

type MemWalHttpClientOptions = {
  baseUrl: string;
  delegateKey: string;
};

export class MemWalHttpClient implements MemWalClient {
  constructor(private readonly options: MemWalHttpClientOptions) {}

  async writeMemory(input: WriteMemoryInput): Promise<LeadMemory> {
    const response = await fetch(`${this.options.baseUrl}/memories`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.delegateKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`MemWal write failed with status ${response.status}`);
    }

    return (await response.json()) as LeadMemory;
  }

  async recall(input: RecallMemoryInput): Promise<LeadMemory[]> {
    const response = await fetch(`${this.options.baseUrl}/memories/recall`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.delegateKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`MemWal recall failed with status ${response.status}`);
    }

    return (await response.json()) as LeadMemory[];
  }
}
