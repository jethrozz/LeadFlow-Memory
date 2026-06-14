import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  GetPostWithCommentsInput,
  SearchPostsInput,
  UserProfile,
  XhsDiscoveryClient,
  XhsDiscoveryComment,
  XhsDiscoveryPost,
} from "./types.js";

type XhsDiscoveryMcpClientOptions = {
  baseUrl: string;
};

// --- Mappers（字段名严格按 xiaohongshu-mcp-tool-contracts.md）---

export function mapLoginStatus(text: string): { loggedIn: boolean; username?: string } {
  const loggedIn = text.includes("已登录") || text.includes("✅");
  if (!loggedIn) return { loggedIn: false };
  const match = text.match(/用户名[：:]\s*(.+)/);
  return { loggedIn: true, username: match?.[1]?.trim() };
}

type RawFeed = {
  id: string;
  xsecToken: string;
  noteCard?: {
    displayTitle?: string;
    user?: { userId?: string; nickname?: string };
    interactInfo?: { likedCount?: string; commentCount?: string; sharedCount?: string };
    cover?: { url?: string };
  };
};

export function mapSearchArgs(input: SearchPostsInput): Record<string, unknown> {
  const filters: Record<string, string> = {};
  if (input.sort) filters["sort_by"] = input.sort;
  if (input.noteType) filters["note_type"] = input.noteType;
  if (input.publishWithin) filters["publish_time"] = input.publishWithin;
  return {
    keyword: input.keyword,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
  };
}

export function mapFeedsToPosts(raw: unknown): XhsDiscoveryPost[] {
  const data = raw as { feeds?: RawFeed[]; count?: number };
  const feeds = data?.feeds ?? [];
  const now = new Date().toISOString();
  return feeds.map((feed) => ({
    platform: "xhs" as const,
    externalId: feed.id,
    url: `https://www.xiaohongshu.com/explore/${feed.id}?xsec_token=${feed.xsecToken}`,
    authorName: feed.noteCard?.user?.nickname,
    authorUserId: feed.noteCard?.user?.userId,
    xsecToken: feed.xsecToken,
    title: feed.noteCard?.displayTitle,
    content: feed.noteCard?.displayTitle ?? "",
    images: feed.noteCard?.cover?.url ? [feed.noteCard.cover.url] : [],
    stats: {
      likes: Number(feed.noteCard?.interactInfo?.likedCount ?? 0) || undefined,
      comments: Number(feed.noteCard?.interactInfo?.commentCount ?? 0) || undefined,
      shares: Number(feed.noteCard?.interactInfo?.sharedCount ?? 0) || undefined,
    },
    capturedAt: now,
    raw: feed,
  }));
}

type RawComment = {
  id: string;
  noteId?: string;
  content: string;
  likeCount?: string;
  createTime?: number;
  userInfo?: { userId?: string; nickname?: string };
};

type RawFeedDetail = {
  note?: {
    noteId?: string;
    xsecToken?: string;
    title?: string;
    desc?: string;
    time?: number;
    user?: { userId?: string; nickname?: string };
    interactInfo?: { likedCount?: string; commentCount?: string; sharedCount?: string };
    imageList?: Array<{ url?: string }>;
  };
  // 真实服务返回 comments 为 { list, cursor, hasMore }；兼容直接数组形式。
  comments?: RawComment[] | { list?: RawComment[]; cursor?: string; hasMore?: boolean };
};

export function mapFeedDetail(
  raw: unknown,
  externalId: string,
  maxComments?: number,
): { post: XhsDiscoveryPost; comments: XhsDiscoveryComment[] } {
  // get_feed_detail 实际返回 { feed_id, data: { note, comments } }；兼容未包裹形式。
  const root = ((raw as { data?: RawFeedDetail })?.data ?? raw) as RawFeedDetail;
  const note = root?.note ?? {};
  const now = new Date().toISOString();
  const noteId = note.noteId ?? externalId;

  const post: XhsDiscoveryPost = {
    platform: "xhs",
    externalId: noteId,
    url: `https://www.xiaohongshu.com/explore/${noteId}`,
    authorName: note.user?.nickname,
    authorUserId: note.user?.userId,
    xsecToken: note.xsecToken ?? root?.note?.xsecToken,
    title: note.title,
    content: note.desc ?? note.title ?? "",
    images: (note.imageList ?? []).map((img) => img.url ?? "").filter(Boolean),
    stats: {
      likes: Number(note.interactInfo?.likedCount ?? 0) || undefined,
      comments: Number(note.interactInfo?.commentCount ?? 0) || undefined,
      shares: Number(note.interactInfo?.sharedCount ?? 0) || undefined,
    },
    publishedAt: note.time ? new Date(note.time).toISOString() : undefined,
    capturedAt: now,
    raw: note,
  };

  const commentList = Array.isArray(root?.comments)
    ? root.comments
    : (root?.comments?.list ?? []);
  const rawComments = commentList.slice(0, maxComments ?? 20);
  const comments: XhsDiscoveryComment[] = rawComments.map((c) => ({
    platform: "xhs",
    externalId: c.id,
    postExternalId: c.noteId ?? noteId,
    authorName: c.userInfo?.nickname,
    authorUserId: c.userInfo?.userId,
    content: c.content,
    likeCount: Number(c.likeCount ?? 0) || undefined,
    publishedAt: c.createTime ? new Date(c.createTime).toISOString() : undefined,
    capturedAt: now,
    raw: c,
  }));

  return { post, comments };
}

type RawUserProfile = {
  // 真实 user_profile 返回的基础信息在 userBasicInfo 下（gender 为数字）。
  userBasicInfo?: {
    nickname?: string;
    redId?: string;
    gender?: number | string;
    desc?: string;
    ipLocation?: string;
    images?: string;
    imageb?: string;
  };
};

export function mapUserProfile(raw: unknown): UserProfile {
  const info = (raw as RawUserProfile)?.userBasicInfo ?? {};
  return {
    nickname: info.nickname,
    redId: info.redId,
    gender: info.gender == null ? undefined : String(info.gender),
    desc: info.desc,
    ipLocation: info.ipLocation,
    avatar: info.images ?? info.imageb,
  };
}

// --- Client ---

export class XhsDiscoveryMcpClient implements XhsDiscoveryClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly options: XhsDiscoveryMcpClientOptions) {}

  private getClient(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StreamableHTTPClientTransport(new URL(this.options.baseUrl));
        const client = new Client({ name: "leadflow-discovery", version: "0.1.0" });
        await client.connect(transport);
        this.client = client;
        return client;
      })().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async callToolText(tool: string, args: Record<string, unknown>): Promise<string> {
    const client = await this.getClient();
    const result = await client.callTool({ name: tool, arguments: args });
    if (result.isError) {
      const errText = JSON.stringify(result.content);
      if (errText.includes("login") || errText.includes("登录") || errText.includes("未登录")) {
        const err = new Error(`xiaohongshu-mcp: 登录失效，请重新扫码`);
        (err as Error & { code: string }).code = "XHS_DISCOVERY_LOGIN_REQUIRED";
        throw err;
      }
      throw new Error(`xiaohongshu-mcp ${tool} failed: ${errText}`);
    }
    const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text" && typeof b.text === "string",
    );
    if (!textBlock?.text) throw new Error(`xiaohongshu-mcp ${tool} returned no text content`);
    return textBlock.text;
  }

  private async callToolJson<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const text = await this.callToolText(tool, args);
    return JSON.parse(text) as T;
  }

  async checkLoginStatus(): Promise<{ loggedIn: boolean; username?: string }> {
    const text = await this.callToolText("check_login_status", {});
    return mapLoginStatus(text);
  }

  async searchPosts(input: SearchPostsInput): Promise<XhsDiscoveryPost[]> {
    const result = await this.callToolJson<unknown>("search_feeds", mapSearchArgs(input));
    const posts = mapFeedsToPosts(result);
    return input.limit ? posts.slice(0, input.limit) : posts;
  }

  async getPostWithComments(input: GetPostWithCommentsInput): Promise<{
    post: XhsDiscoveryPost;
    comments: XhsDiscoveryComment[];
  }> {
    // externalId 格式：feedId，url 含 xsec_token 参数时从 url 解析；
    // 否则 xsec_token 传空字符串（服务可能仍可处理）。
    const url = input.url ?? "";
    const xsecToken =
      new URL(url.startsWith("http") ? url : `https://x.com${url}`).searchParams.get(
        "xsec_token",
      ) ?? "";
    // get_feed_detail 仅接受 feed_id + xsec_token（schema additionalProperties:false）；
    // 评论数量在 mapFeedDetail 里客户端切片。
    const result = await this.callToolJson<unknown>("get_feed_detail", {
      feed_id: input.externalId,
      xsec_token: xsecToken,
    });
    return mapFeedDetail(result, input.externalId, input.maxComments);
  }

  async getUserProfile(input: { userId: string; xsecToken: string }): Promise<UserProfile> {
    const raw = await this.callToolJson<unknown>("user_profile", {
      user_id: input.userId,
      xsec_token: input.xsecToken,
    });
    return mapUserProfile(raw);
  }
}
