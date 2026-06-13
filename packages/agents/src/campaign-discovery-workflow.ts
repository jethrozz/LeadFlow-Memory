import { createArtifactPayload } from "@leadflow/walrus";
import { runDiscoveryWorkflow } from "./discovery-workflow.js";
import type {
  CampaignDiscoveryInput,
  CampaignDiscoveryResult,
  DiscoveredCampaignLead,
  WorkflowServices,
} from "./types.js";

const DEFAULT_MAX_POSTS = 20;
const DEFAULT_MAX_COMMENTS = 50;
const DEFAULT_DELAY_MS = 2000;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// hasLeadIntent 门槛较宽，发现 Agent 可能进一步判定为 Ignore（如中介自荐、已购房）。
// 只把非 Ignore 的意向落库为线索，避免污染线索列表。
function isQualifiedIntent(intentLevel: string): boolean {
  return intentLevel.trim().toLowerCase() !== "ignore";
}

/** 调用 user_profile 获取小红书号（redId），失败时静默返回 undefined。 */
async function fetchRedId(
  services: WorkflowServices,
  userId: string,
  xsecToken: string,
): Promise<string | undefined> {
  if (!services.xhsDiscovery?.getUserProfile) return undefined;
  try {
    const profile = await services.xhsDiscovery.getUserProfile({ userId, xsecToken });
    return profile.redId;
  } catch {
    return undefined;
  }
}

async function isRelevant(
  services: WorkflowServices,
  keyword: string,
  content: string,
): Promise<boolean> {
  const result = await services.llm.chatJson({
    system:
      "你是一个内容相关性判断器。判断以下内容是否与给定关键词主题高度相关，且可能包含购房意向信号。只回答 JSON: {\"relevant\": true/false, \"reason\": \"...\"}",
    messages: [{ role: "user", content: `关键词：${keyword}\n\n内容：${content}` }],
  });
  return Boolean(result.relevant);
}

async function hasLeadIntent(services: WorkflowServices, content: string): Promise<boolean> {
  const result = await services.llm.chatJson({
    system:
      "判断以下内容是否表达了真实的购房需求或意向（如预算、区域、户型需求、时间规划等）。只回答 JSON: {\"hasIntent\": true/false}",
    messages: [{ role: "user", content }],
  });
  return Boolean(result.hasIntent);
}

export async function runCampaignDiscoveryWorkflow(
  services: WorkflowServices,
  input: CampaignDiscoveryInput,
): Promise<CampaignDiscoveryResult> {
  if (!services.xhsDiscovery) {
    throw new Error("xhsDiscovery service is required for campaign discovery workflow");
  }

  const maxPosts = input.maxPostsPerRun ?? DEFAULT_MAX_POSTS;
  const maxComments = input.maxCommentsPerPost ?? DEFAULT_MAX_COMMENTS;
  const delayMs = input.delayMs ?? DEFAULT_DELAY_MS;
  const targetLeadCount = input.targetLeadCount ?? 0; // 0 = 不限制
  const existingIds = input.existingLeadExternalIds ?? new Set<string>();
  const onProgress = input.onProgress;

  const playbook = input.playbook;
  const allArtifacts: string[] = [];
  const leads: DiscoveredCampaignLead[] = [];
  let searched = 0;
  let relevant = 0;
  let leadsCreated = 0;
  let skipped = 0;

  // Step 1: 搜索帖子
  const keyword = input.seedKeywords[0] ?? input.campaignId;
  const posts = await services.xhsDiscovery.searchPosts({ keyword, limit: maxPosts });
  searched = posts.length;

  await delay(delayMs);

  // Step 2-7: 过滤 → 获取详情 → 识别意向 → 逐条 discovery
  for (const post of posts) {
    // 目标制：已采集够数，提前退出
    if (targetLeadCount > 0 && leadsCreated >= targetLeadCount) break;

    const relevantFlag = await isRelevant(services, keyword, post.content ?? post.title ?? "");
    if (!relevantFlag) {
      skipped++;
      continue;
    }
    relevant++;

    await delay(delayMs);

    // Step 3: 获取帖子详情和评论
    const detail = await services.xhsDiscovery
      .getPostWithComments({ externalId: post.externalId, url: post.url, maxComments })
      .catch(() => null);
    if (!detail) {
      skipped++;
      continue;
    }

    await delay(delayMs);

    // Step 4: 存储 source_snapshot artifact
    const snapshotArtifact = await services.walrus.store(
      createArtifactPayload({
        leadId: post.externalId,
        type: "source_snapshot",
        data: { post: detail.post, capturedAt: new Date().toISOString() },
      }),
    );
    allArtifacts.push(snapshotArtifact.blobId);

    // Step 5: 检查帖子作者是否有购房意向（去重：跳过已存在的 externalId）
    const postExternalId = post.externalId;
    if (!existingIds.has(postExternalId)) {
      const postHasIntent = await hasLeadIntent(services, detail.post.content);
      if (postHasIntent) {
        const leadId = `lead_xhs_${post.externalId}`;
        const memorySpaceId = `space_${leadId}`;
        const sourceText = `[小红书帖子] 作者：${detail.post.authorName ?? "未知"}\n\n${detail.post.content}`;
        const discovery = await runDiscoveryWorkflow(services, {
          leadId,
          memorySpaceId,
          sourceText,
          playbook,
        });
        if (isQualifiedIntent(discovery.intentLevel)) {
          existingIds.add(postExternalId); // 标记为已处理
          // 获取小红书号（redId）。user_profile 的 xsec_token 必须来自 search_feeds 阶段的
          // post.xsecToken——get_feed_detail 的响应往往不回带 token（detail.post.xsecToken 为空）。
          const authorRedId = detail.post.authorUserId && post.xsecToken
            ? await fetchRedId(services, detail.post.authorUserId, post.xsecToken)
            : undefined;
          await delay(delayMs);
          leads.push({
            leadId,
            memorySpaceId,
            platform: "xhs",
            displayName: detail.post.authorName ?? leadId,
            authorUserId: detail.post.authorUserId,
            authorRedId,
            sourceType: "post",
            sourceText,
            intentLevel: discovery.intentLevel,
            summary: discovery.summary,
            extractedFields: discovery.extractedFields,
            needs: discovery.needs,
            concerns: discovery.concerns,
            memoryRef: discovery.memoryRef,
            sourceArtifactBlobId: snapshotArtifact.blobId,
            reportArtifactBlobId: discovery.artifact.blobId,
          });
          leadsCreated++;
          onProgress?.({ searched, relevant, leadsCreated, skipped });

          // 目标制：采集够数，提前退出
          if (targetLeadCount > 0 && leadsCreated >= targetLeadCount) break;
        }
      }
    }

    // Step 6: 检查评论区意向
    for (const comment of detail.comments) {
      // 目标制：每条评论前也检查
      if (targetLeadCount > 0 && leadsCreated >= targetLeadCount) break;

      const commentExternalId = comment.externalId;
      if (existingIds.has(commentExternalId)) continue; // 去重

      const commentHasIntent = await hasLeadIntent(services, comment.content);
      if (!commentHasIntent) continue;

      const commentLeadId = `lead_xhs_comment_${comment.externalId}`;
      const commentMemorySpaceId = `space_${commentLeadId}`;

      const commentSnapshotArtifact = await services.walrus.store(
        createArtifactPayload({
          leadId: commentLeadId,
          type: "source_snapshot",
          data: {
            comment,
            postExternalId: post.externalId,
            capturedAt: new Date().toISOString(),
          },
        }),
      );
      allArtifacts.push(commentSnapshotArtifact.blobId);

      const commentSourceText = `[小红书评论] 来自帖子：${detail.post.title ?? post.externalId}\n作者：${comment.authorName ?? "未知"}\n\n${comment.content}`;
      const commentDiscovery = await runDiscoveryWorkflow(services, {
        leadId: commentLeadId,
        memorySpaceId: commentMemorySpaceId,
        sourceText: commentSourceText,
        playbook,
      });
      if (isQualifiedIntent(commentDiscovery.intentLevel)) {
        existingIds.add(commentExternalId); // 标记为已处理
        // 获取小红书号（redId），用帖子的 xsecToken
        const commentRedId = comment.authorUserId && post.xsecToken
          ? await fetchRedId(services, comment.authorUserId, post.xsecToken)
          : undefined;
        await delay(delayMs);
        leads.push({
          leadId: commentLeadId,
          memorySpaceId: commentMemorySpaceId,
          platform: "xhs",
          displayName: comment.authorName ?? commentLeadId,
          authorUserId: comment.authorUserId,
          authorRedId: commentRedId,
          sourceType: "comment",
          sourceText: commentSourceText,
          intentLevel: commentDiscovery.intentLevel,
          summary: commentDiscovery.summary,
          extractedFields: commentDiscovery.extractedFields,
          needs: commentDiscovery.needs,
          concerns: commentDiscovery.concerns,
          memoryRef: commentDiscovery.memoryRef,
          sourceArtifactBlobId: commentSnapshotArtifact.blobId,
          reportArtifactBlobId: commentDiscovery.artifact.blobId,
        });
        leadsCreated++;
        onProgress?.({ searched, relevant, leadsCreated, skipped });
      }

      await delay(delayMs);
    }
  }

  return {
    campaignId: input.campaignId,
    searched,
    relevant,
    leadsCreated,
    skipped,
    artifacts: allArtifacts,
    leads,
  };
}
