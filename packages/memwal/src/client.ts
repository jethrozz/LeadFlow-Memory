import { MemWal } from "@mysten-incubation/memwal";
import type {
  LeadMemory,
  MemWalClient,
  RecallMemoryInput,
  WriteMemoryInput,
} from "./types.js";

type MemWalSdkClientOptions = {
  baseUrl: string;
  delegateKey: string;
  accountId: string;
};

/**
 * 基于 @mysten-incubation/memwal 官方 SDK 的 MemWal 客户端。
 *
 * remember 是异步的：先提交 job，再 waitForRememberJob 轮询结果。
 * recall 是同步的：直接返回语义搜索结果。
 */
export class MemWalSdkClient implements MemWalClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly sdk: any;
  private readonly defaultNamespace: string;

  constructor(options: MemWalSdkClientOptions) {
    this.sdk = MemWal.create({
      key: options.delegateKey,
      accountId: options.accountId,
      serverUrl: options.baseUrl,
    });
    this.defaultNamespace = "default";
  }

  async writeMemory(input: WriteMemoryInput): Promise<LeadMemory> {
    const namespace = input.memorySpaceId || this.defaultNamespace;

    // 提交 remember job
    const job = await this.sdk.remember(input.content, namespace);

    // 等待 job 完成
    const result = await this.sdk.waitForRememberJob(job.job_id);

    return {
      id: result.id ?? result.job_id ?? `mem_${result.blob_id}`,
      leadId: input.leadId,
      memorySpaceId: input.memorySpaceId,
      content: input.content,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
  }

  async recall(input: RecallMemoryInput): Promise<LeadMemory[]> {
    const namespace = input.memorySpaceId || this.defaultNamespace;

    const result = await this.sdk.recall(input.query, input.limit, namespace);

    return (result.results ?? []).map((r: { blob_id?: string; text?: string; distance?: number }, i: number) => ({
      id: `mem_${r.blob_id ?? i}`,
      leadId: input.leadId,
      memorySpaceId: input.memorySpaceId,
      content: r.text ?? "",
      metadata: {
        source: "manual" as const,
        confidence: 1 - (r.distance ?? 0),
        artifactRefs: r.blob_id ? [r.blob_id] : [],
      },
      createdAt: new Date().toISOString(),
    }));
  }
}
