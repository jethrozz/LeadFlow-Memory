import type {
  StoredWalrusArtifact,
  WalrusArtifactClient,
  WalrusArtifactPayload,
} from "@leadflow/walrus";

/**
 * 容错版 Walrus 写入：artifact 存储失败时不抛出，记录警告并返回一个
 * blobId 为空的占位 artifact，保证发现/转化流程不因证据存储不可用而整轮中止
 * （线索本体、画像、SocialIdentity 等仍能正常落库）。
 */
export async function safeWalrusStore(
  walrus: WalrusArtifactClient,
  payload: WalrusArtifactPayload,
): Promise<StoredWalrusArtifact> {
  try {
    return await walrus.store(payload);
  } catch (err) {
    console.warn(
      "[agents] Walrus store failed, continuing without artifact:",
      err instanceof Error ? err.message : err,
    );
    return {
      id: "",
      leadId: payload.leadId,
      type: payload.type,
      blobId: "",
      fileName: payload.fileName,
      contentType: payload.contentType,
      sizeBytes: 0,
      storedAt: new Date().toISOString(),
    };
  }
}
