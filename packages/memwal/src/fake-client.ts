import type {
  LeadMemory,
  MemWalClient,
  RecallMemoryInput,
  WriteMemoryInput,
} from "./types.js";

export class FakeMemWalClient implements MemWalClient {
  private readonly memories: LeadMemory[] = [];
  private sequence = 0;

  async writeMemory(input: WriteMemoryInput): Promise<LeadMemory> {
    this.sequence += 1;
    const memory: LeadMemory = {
      id: `mem_${this.sequence.toString().padStart(4, "0")}`,
      leadId: input.leadId,
      memorySpaceId: input.memorySpaceId,
      content: input.content,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
    this.memories.push(memory);
    return memory;
  }

  async recall(input: RecallMemoryInput): Promise<LeadMemory[]> {
    const queryTokens = input.query.split(/\s+/).filter(Boolean);
    return this.memories
      .filter((memory) => memory.leadId === input.leadId)
      .filter((memory) => memory.memorySpaceId === input.memorySpaceId)
      .filter((memory) => queryTokens.length === 0 || queryTokens.some((token) => memory.content.includes(token)))
      .slice(0, input.limit);
  }
}
