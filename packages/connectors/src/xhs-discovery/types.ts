export type XhsDiscoveryPost = {
  platform: "xhs";
  externalId: string;
  url: string;
  authorName?: string;
  authorUrl?: string;
  title?: string;
  content: string;
  images?: string[];
  stats?: { likes?: number; comments?: number; shares?: number };
  publishedAt?: string;
  capturedAt: string;
  raw?: unknown;
};

export type XhsDiscoveryComment = {
  platform: "xhs";
  externalId: string;
  postExternalId: string;
  authorName?: string;
  authorUrl?: string;
  content: string;
  likeCount?: number;
  publishedAt?: string;
  capturedAt: string;
  raw?: unknown;
};

export type SearchPostsInput = {
  keyword: string;
  limit?: number;
  sort?: string;
  noteType?: string;
  publishWithin?: string;
};

export type GetPostWithCommentsInput = {
  externalId: string;
  url?: string;
  maxComments?: number;
};

export type XhsDiscoveryClient = {
  checkLoginStatus(): Promise<{ loggedIn: boolean; username?: string }>;
  searchPosts(input: SearchPostsInput): Promise<XhsDiscoveryPost[]>;
  getPostWithComments(input: GetPostWithCommentsInput): Promise<{
    post: XhsDiscoveryPost;
    comments: XhsDiscoveryComment[];
  }>;
  getCreatorPosts?(input: { profileUrl: string; limit?: number }): Promise<XhsDiscoveryPost[]>;
};
