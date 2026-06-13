import { describe, expect, it } from "vitest";
import { FakeXhsDiscoveryClient } from "../index.js";

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
});
