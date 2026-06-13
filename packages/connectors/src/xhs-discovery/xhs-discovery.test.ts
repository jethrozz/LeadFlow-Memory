import { describe, expect, it } from "vitest";
import { FakeXhsDiscoveryClient } from "../index.js";
import { mapFeedsToPosts, mapLoginStatus } from "./mcp-client.js";

describe("XHS discovery connector", () => {
  it("searches posts by keyword", async () => {
    const client = new FakeXhsDiscoveryClient();
    const posts = await client.searchPosts({ keyword: "渝北三房", limit: 5 });
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]?.platform).toBe("xhs");
    expect(posts[0]?.content).toContain("渝北");
  });

  it("gets post detail with comments", async () => {
    const client = new FakeXhsDiscoveryClient();
    const detail = await client.getPostWithComments({ externalId: "fake_post_001" });
    expect(detail.post.externalId).toBe("fake_post_001");
    expect(detail.comments.some((c) => c.content.includes("130万"))).toBe(true);
  });

  it("reports login status", async () => {
    const client = new FakeXhsDiscoveryClient();
    const status = await client.checkLoginStatus();
    expect(status.loggedIn).toBe(true);
  });

  it("mapLoginStatus parses logged-in text", () => {
    const result = mapLoginStatus("✅ 已登录\n用户名: testuser\n其他信息");
    expect(result.loggedIn).toBe(true);
    expect(result.username).toBe("testuser");
  });

  it("mapLoginStatus parses not-logged-in text", () => {
    const result = mapLoginStatus("❌ 未登录，请扫码");
    expect(result.loggedIn).toBe(false);
  });

  it("mapFeedsToPosts maps search result to posts", () => {
    const raw = {
      feeds: [
        {
          id: "post_abc",
          xsecToken: "tok_123",
          noteCard: {
            displayTitle: "渝北三房推荐",
            user: { userId: "u1", nickname: "陈薇" },
            interactInfo: { likedCount: "88", commentCount: "12", sharedCount: "3" },
            cover: { url: "https://example.com/img.jpg" },
          },
        },
      ],
      count: 1,
    };
    const posts = mapFeedsToPosts(raw);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.externalId).toBe("post_abc");
    expect(posts[0]?.platform).toBe("xhs");
    expect(posts[0]?.authorName).toBe("陈薇");
    expect(posts[0]?.title).toBe("渝北三房推荐");
    expect(posts[0]?.stats?.likes).toBe(88);
  });
});
