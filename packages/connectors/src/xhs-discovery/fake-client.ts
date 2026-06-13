import type {
  GetPostWithCommentsInput,
  SearchPostsInput,
  UserProfile,
  XhsDiscoveryClient,
  XhsDiscoveryComment,
  XhsDiscoveryPost,
} from "./types.js";

const NOW = "2026-06-13T10:00:00.000Z";

const FAKE_POSTS: XhsDiscoveryPost[] = [
  {
    platform: "xhs",
    externalId: "fake_post_001",
    url: "https://www.xiaohongshu.com/explore/fake_post_001",
    authorName: "重庆买房小陈",
    authorUserId: "xhs_user_001",
    xsecToken: "xsec_token_001",
    title: "渝北三房求推荐，预算130万以内",
    content: "想在渝北买套三房，总价130万以内，孩子明年要上小学，求推荐学区房！",
    stats: { likes: 88, comments: 23, shares: 5 },
    publishedAt: NOW,
    capturedAt: NOW,
  },
  {
    platform: "xhs",
    externalId: "fake_post_002",
    url: "https://www.xiaohongshu.com/explore/fake_post_002",
    authorName: "渝北置业顾问",
    authorUserId: "xhs_user_002",
    xsecToken: "xsec_token_002",
    title: "渝北新房最新补贴政策整理",
    content: "整理了渝北区最新购房补贴，首套房有优惠，三房户型性价比高。",
    stats: { likes: 256, comments: 41, shares: 18 },
    publishedAt: NOW,
    capturedAt: NOW,
  },
];

const FAKE_COMMENTS: XhsDiscoveryComment[] = [
  {
    platform: "xhs",
    externalId: "fake_comment_001",
    postExternalId: "fake_post_001",
    authorName: "购房观察员",
    authorUserId: "xhs_user_003",
    content: "预算130万在渝北还行，可以看看龙湖那边的盘",
    likeCount: 12,
    publishedAt: NOW,
    capturedAt: NOW,
  },
  {
    platform: "xhs",
    externalId: "fake_comment_002",
    postExternalId: "fake_post_001",
    authorName: "过来人分享",
    authorUserId: "xhs_user_004",
    content: "我家也是130万上下买的渝北三房，学区还不错，孩子上学很方便",
    likeCount: 8,
    publishedAt: NOW,
    capturedAt: NOW,
  },
];

export class FakeXhsDiscoveryClient implements XhsDiscoveryClient {
  async checkLoginStatus(): Promise<{ loggedIn: boolean; username?: string }> {
    return { loggedIn: true, username: "fake_user" };
  }

  async searchPosts(input: SearchPostsInput): Promise<XhsDiscoveryPost[]> {
    const results = FAKE_POSTS.filter((p) => p.content.includes("渝北") || p.title?.includes("渝北"));
    const limit = input.limit ?? results.length;
    return results.slice(0, limit);
  }

  async getPostWithComments(input: GetPostWithCommentsInput): Promise<{
    post: XhsDiscoveryPost;
    comments: XhsDiscoveryComment[];
  }> {
    const found = FAKE_POSTS.find((p) => p.externalId === input.externalId);
    // 模拟真实 get_feed_detail：详情响应不回带 xsecToken（约 1/4 feed 详情也会缺失），
    // 换 redId 的 user_profile 调用必须改用 search_feeds 阶段拿到的 xsecToken。
    const post: XhsDiscoveryPost = found
      ? { ...found, xsecToken: undefined }
      : {
          platform: "xhs" as const,
          externalId: input.externalId,
          url: input.url ?? `https://www.xiaohongshu.com/explore/${input.externalId}`,
          content: "渝北三房，预算130万以内",
          capturedAt: NOW,
        };
    const comments = FAKE_COMMENTS.filter((c) => c.postExternalId === input.externalId).slice(
      0,
      input.maxComments ?? 20,
    );
    return { post, comments };
  }

  async getUserProfile(input: { userId: string; xsecToken: string }): Promise<UserProfile> {
    const redIdMap: Record<string, string> = {
      xhs_user_001: "red_chongqing_001",
      xhs_user_002: "red_yubei_advisor",
      xhs_user_003: "red_observer_003",
      xhs_user_004: "red_sharer_004",
    };
    return {
      nickname: `fake_user_${input.userId}`,
      redId: redIdMap[input.userId] ?? `red_${input.userId}`,
    };
  }
}
