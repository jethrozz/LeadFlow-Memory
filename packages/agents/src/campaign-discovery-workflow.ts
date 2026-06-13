import { createArtifactPayload } from "@leadflow/walrus";
import { runDiscoveryWorkflow } from "./discovery-workflow.js";
import type {
  CampaignDiscoveryInput,
  CampaignDiscoveryResult,
  WorkflowServices,
} from "./types.js";

const DEFAULT_MAX_POSTS = 20;
const DEFAULT_MAX_COMMENTS = 50;
const DEFAULT_DELAY_MS = 2000;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const allArtifacts: string[] = [];
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
    const relevantFlag = await isRelevant(services, keyword, post.content ?? post.title ?? "");
    if (!relevantFlag) {
      skipped++;
      continue;
    }
    relevant++;

    await delay(delayMs);

    // Step 3: 获取帖子详情和评论
    const detail = await services.xhsDiscovery.getPostWithComments({
      externalId: post.externalId,
      url: post.url,
      maxComments,
    });

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

    // Step 5: 检查帖子作者是否有购房意向
    const postHasIntent = await hasLeadIntent(services, detail.post.content);
    if (postHasIntent) {
      const leadId = `lead_xhs_${post.externalId}`;
      const memorySpaceId = `space_${leadId}`;
      await runDiscoveryWorkflow(services, {
        leadId,
        memorySpaceId,
        sourceText: `[小红书帖子] 作者：${detail.post.authorName ?? "未知"}\n\n${detail.post.content}`,
      });
      leadsCreated++;
    }

    // Step 6: 检查评论区意向
    for (const comment of detail.comments) {
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

      await runDiscoveryWorkflow(services, {
        leadId: commentLeadId,
        memorySpaceId: commentMemorySpaceId,
        sourceText: `[小红书评论] 来自帖子：${detail.post.title ?? post.externalId}\n作者：${comment.authorName ?? "未知"}\n\n${comment.content}`,
      });
      leadsCreated++;

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
  };
}
