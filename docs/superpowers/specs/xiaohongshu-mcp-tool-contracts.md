# xiaohongshu-mcp 工具契约

> 来源：https://github.com/xpzouying/xiaohongshu-mcp 源码分析（2026-06-13）
> 服务默认地址：http://localhost:18060/mcp（StreamableHTTP transport）

---

## check_login_status

**入参**：无

**返回**：MCP text content（非 JSON），格式为人类可读文本。
- 已登录时：`"✅ 已登录\n用户名: {username}\n..."`
- 未登录时：`"❌ 未登录"` 或类似否定文本

**映射规则**：
```ts
loggedIn = text.includes("已登录") || text.includes("✅")
username = text 中 "用户名:" 后的第一行
```

---

## search_feeds

**入参（JSON）**：
```json
{
  "keyword": "string（必需）",
  "filters": {
    "sort_by":       "综合 | 最新 | 最多点赞 | 最多评论 | 最多收藏（默认：综合）",
    "note_type":     "不限 | 视频 | 图文（默认：不限）",
    "publish_time":  "不限 | 一天内 | 一周内 | 半年内（默认：不限）",
    "search_scope":  "不限 | 已看过 | 未看过 | 已关注（默认：不限）",
    "location":      "不限 | 同城 | 附近（默认：不限）"
  }
}
```

**返回（JSON）**：
```json
{
  "feeds": [
    {
      "id": "string（feed_id，用于 get_feed_detail）",
      "xsecToken": "string（用于 get_feed_detail 的 xsec_token）",
      "modelType": "string",
      "noteCard": {
        "type": "string（normal | video）",
        "displayTitle": "string（标题）",
        "user": {
          "userId": "string",
          "nickname": "string",
          "avatar": "string（头像 URL）"
        },
        "interactInfo": {
          "liked": "bool",
          "likedCount": "string（点赞数，字符串格式如 '1234'）",
          "commentCount": "string",
          "collectedCount": "string",
          "sharedCount": "string"
        },
        "cover": { "url": "string" }
      }
    }
  ],
  "count": "int（结果总数）"
}
```

**操作说明**：
- 无原生分页参数，MVP 通过截断 `feeds` 数组实现 `maxPostsPerRun` 限制。
- 搜索结果仅含摘要信息（无完整正文），需再调 get_feed_detail 获取详情。

---

## get_feed_detail

**入参（JSON）**：
```json
{
  "feed_id":             "string（必需，来自 search_feeds 的 feed.id）",
  "xsec_token":          "string（必需，来自 search_feeds 的 feed.xsecToken）",
  "load_all_comments":   "bool（可选，默认 false）",
  "max_comment_items":   "int（可选，默认 20，评论条数上限）",
  "click_more_replies":  "bool（可选，是否展开子评论）",
  "max_replies_threshold": "int（可选，默认 10）",
  "scroll_speed":        "slow | normal | fast（可选）"
}
```

**返回（JSON）**：
```json
{
  "note": {
    "noteId":    "string（= feed_id）",
    "xsecToken": "string",
    "title":     "string",
    "desc":      "string（正文内容）",
    "type":      "string（normal | video）",
    "time":      "int64（发布时间，Unix 毫秒时间戳）",
    "ipLocation": "string",
    "user": {
      "userId":   "string",
      "nickname": "string",
      "avatar":   "string"
    },
    "interactInfo": {
      "likedCount":     "string",
      "commentCount":   "string",
      "collectedCount": "string",
      "sharedCount":    "string"
    },
    "imageList": [{ "url": "string" }]
  },
  "comments": [
    {
      "id":         "string（评论 ID）",
      "noteId":     "string（所属帖子 ID）",
      "content":    "string",
      "likeCount":  "string",
      "createTime": "int64（Unix 毫秒时间戳）",
      "ipLocation": "string",
      "userInfo": {
        "userId":   "string",
        "nickname": "string"
      },
      "subCommentCount": "int",
      "subComments": [ "...（Comment 嵌套结构，字段同上）" ]
    }
  ]
}
```

---

## user_profile

**入参（JSON）**：
```json
{
  "user_id":    "string（必需，来自 feed.noteCard.user.userId）",
  "xsec_token": "string（必需，来自 search_feeds 的 feed.xsecToken）"
}
```

**返回（JSON）**：
```json
{
  "basicInfo": {
    "nickname":   "string",
    "redId":      "string",
    "gender":     "string",
    "desc":       "string（简介）",
    "ipLocation": "string",
    "images":     "string（头像 URL）"
  },
  "interactions": [
    { "type": "string", "name": "string", "count": "string" }
  ],
  "feeds": [ "...（Feed 数组，结构同 search_feeds 的 feeds[i]）" ]
}
```

**MVP 说明**：`user_profile.feeds` 包含博主的笔记列表，可实现 `getCreatorPosts`。

---

## 错误处理

| 场景 | 表现 | 处理方式 |
|------|------|----------|
| 未登录 | check_login_status 返回否定文本；其他工具可能返回空结果或错误 | 抛 `XHS_DISCOVERY_LOGIN_REQUIRED` 错误，API 层映射为 409 |
| 服务未启动 | TCP 连接被拒绝 | 启动报错，不回退 fake |
| 限流/风控 | 工具返回错误或结果为空 | 记录日志，跳过当前帖子，继续处理其他 |

---

## 运营约束

- 单次搜索返回上限：由平台决定（实测约 20 条），通过 `maxPostsPerRun` 截断。
- 评论默认取 20 条（`max_comment_items`），MVP 不做分页深采。
- 相邻工具调用之间加延迟：`XHS_DISCOVERY_DELAY_MS`（默认 2000ms）。
- 所有操作只读：只调用 search_feeds、get_feed_detail、user_profile，不调用写操作工具。
