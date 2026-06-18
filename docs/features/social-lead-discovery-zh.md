# Social Lead Discovery 功能规格

## 模块定位

Social Lead Discovery 是 LeadFlow Memory 的线索发现模块。

它不是单纯的小红书爬虫，而是一个面向长期销售 Agent 的社交平台线索发现层。

核心目标：

> 连接不同社交平台，基于行业目标自动生成搜索策略，发现帖子和评论中的购买意向，并把这些社交信号转化为可验证的客户长期记忆。

第一阶段实现小红书连接器。

后续可扩展到：

- 抖音
- 快手
- 微博
- 知乎
- B 站
- 微信公众号

## 产品叙事

英文：

> Social Lead Discovery is a connector-based discovery layer for long-running sales agents. Xiaohongshu is the first connector; the same workflow can later expand to Douyin, Weibo, Zhihu, and other social platforms.

中文：

> Social Lead Discovery 是面向长期销售 Agent 的连接器式线索发现层。小红书是第一个平台连接器，后续可以扩展到抖音、微博、知乎等平台。

## 第一阶段范围

第一阶段只实现：

```text
Xiaohongshu Connector
```

支持三种线索来源：

1. 关键词搜索帖子
2. 指定博主内容扫描
3. 手动导入真实内容

其中，帖子正文和评论区都可以成为线索来源。

## 用户输入

用户通过 Discovery Campaign 配置一次发现任务。

### Campaign 配置项

```ts
type CrawlerCampaign = {
  id: string;
  name: string;
  industry: "real_estate" | "auto" | "renovation" | "education" | "insurance" | "b2b";
  city?: string;
  targetCustomer: string;
  seedKeywords: string[];
  targetCreators: TargetCreator[];
  sourceModes: Array<"search_posts" | "creator_posts" | "comments" | "manual_import">;
  maxPostsPerRun: number;
  maxCommentsPerPost: number;
  createdAt: string;
  updatedAt: string;
};

type TargetCreator = {
  platform: SocialPlatform;
  name?: string;
  profileUrl?: string;
  externalId?: string;
};
```

### 房产 Demo 示例

```text
行业：房产
城市：成都
目标客户：准备买房的人
关键词：高新区买房、130万三房、学区房
目标博主：成都房产博主账号
采集范围：帖子正文 + 评论区
```

## 核心用户流程

```text
1. 用户创建 Discovery Campaign
2. Agent 根据行业目标生成搜索关键词
3. Connector 搜索社交平台帖子
4. Agent 判断帖子是否和目标主题相关
5. Connector 获取帖子评论区
6. Agent 从帖子正文和评论中识别购买意向
7. Agent 生成候选 lead
8. Agent 对 lead 打分
9. 系统创建 lead 业务记录
10. 系统写入 MemWal 初始记忆
11. 系统将来源证据和发现报告存入 Walrus
12. Dashboard 展示发现结果
```

## 平台连接器抽象

Social Lead Discovery 通过 Platform Connector 适配不同社交平台。

### SocialPlatform

```ts
type SocialPlatform =
  | "xhs"
  | "douyin"
  | "kuaishou"
  | "weibo"
  | "zhihu"
  | "bilibili"
  | "wechat_official_account";
```

### SocialConnector

```ts
interface SocialConnector {
  platform: SocialPlatform;

  searchPosts(input: SearchPostsInput): Promise<SocialPost[]>;

  getPost(input: GetPostInput): Promise<SocialPost>;

  getComments(input: GetCommentsInput): Promise<SocialComment[]>;

  getCreatorPosts(input: GetCreatorPostsInput): Promise<SocialPost[]>;
}
```

### 第一版实现

```text
XhsConnector implements SocialConnector
```

## 统一内容模型

业务分析层不直接依赖小红书原始字段，而是依赖统一内容模型。

### SocialPost

```ts
type SocialPost = {
  platform: SocialPlatform;
  externalId: string;
  url: string;
  authorName?: string;
  authorUrl?: string;
  title?: string;
  content: string;
  images?: string[];
  stats?: {
    likes?: number;
    comments?: number;
    shares?: number;
  };
  publishedAt?: string;
  capturedAt: string;
  raw?: unknown;
};
```

### SocialComment

```ts
type SocialComment = {
  platform: SocialPlatform;
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
```

### LeadSource

```ts
type LeadSource = {
  platform: SocialPlatform;
  sourceType: "post" | "comment" | "creator_profile" | "manual_import";
  post?: SocialPost;
  comment?: SocialComment;
  capturedAt: string;
};
```

## 搜索关键词生成

用户可以输入 seed keywords，但系统需要根据行业和目标客户自动扩展搜索关键词。

### 输入

```text
行业 = 房产
城市 = 成都
目标客户 = 准备买房的人
seed keywords = 高新区买房、130万三房
```

### 输出示例

```text
成都买房预算
高新区三房
成都首套房
成都学区房
130万买房
地铁口二手房
天府新区看房
首付40万买房
```

### 要求

关键词生成结果需要保存为 artifact 的一部分，方便后续解释为什么搜索了这些内容。

## 帖子主题过滤

搜索结果不直接进入线索分析，先判断帖子是否与目标行业和目标客户相关。

```ts
type PostRelevance = {
  isRelevant: boolean;
  confidence: number;
  topic: string;
  reasons: string[];
};
```

例如：

```text
相关：讨论成都高新区买房预算、学区、户型、通勤
不相关：纯房产资讯、装修晒图、无购房意向的泛讨论
```

## 评论区意向识别

评论区是重要线索来源。

### 房产行业重点识别

```text
预算：130万、首付40万、月供压力
区域：高新区、天府新区、金融城
户型：三房、两房、改善型
目的：自住、学区、投资、置换
顾虑：通勤、学区、总价、首付、月供
时间线：今年买、孩子明年上学、近期看房
```

### 示例评论

```text
“130万能买高新区三房吗？”
“想给孩子明年上学用，有推荐的小区吗？”
“首付40万左右，能看哪些盘？”
```

这些评论应该被识别为潜在购房线索。

## 线索来源类型

```ts
type LeadSourceType =
  | "post_author_intent"
  | "post_content_signal"
  | "comment_intent"
  | "manual_import";
```

### 含义

```text
post_author_intent:
发帖人自己表达了购买意向。

post_content_signal:
帖子正文中包含可转化的需求信号。

comment_intent:
评论区用户表达了购买意向。

manual_import:
用户手动导入的线索内容。
```

## 购房意图提取

Agent 使用 LLM 从帖子或评论中提取结构化购房意图。

```ts
type RealEstateIntent = {
  isPotentialBuyer: boolean;
  confidence: number;
  buyerStage: "browsing" | "considering" | "ready_to_view" | "ready_to_buy";
  budget?: {
    min?: number;
    max?: number;
    rawText?: string;
  };
  locationPreferences: string[];
  layoutPreferences: string[];
  purpose?: "self_use" | "investment" | "school" | "upgrade" | "unknown";
  concerns: string[];
  timeline?: string;
  decisionMakers?: string[];
  contactOpportunity: boolean;
  evidenceQuotes: string[];
};
```

## Lead Scoring

### 等级定义

```text
S：明确预算 + 明确区域 + 明确看房/联系意愿
A：明确区域/预算/户型中的至少两个，且有真实购房需求
B：有购房兴趣，但需求模糊
C：泛泛讨论，不建议优先跟进
Ignore：不是买房客户
```

### 数据结构

```ts
type LeadScore = {
  level: "S" | "A" | "B" | "C" | "Ignore";
  score: number;
  reasons: string[];
  riskFlags: string[];
};
```

## 初始记忆生成

线索进入系统后，需要写入 MemWal 初始长期记忆。

记忆不应只是原文复制，而应该是 Agent 后续可以 recall 的事实。

### 示例

```text
客户在高新区三房帖子下评论，询问 130 万预算是否可买。
客户可能预算上限约 130 万。
客户关注区域为高新区。
客户处于购房探索阶段。
推荐首次开场从“预算可行性 + 区域选择”切入。
```

### 数据结构

```ts
type LeadMemoryFact = {
  leadId: string;
  kind:
    | "budget"
    | "location"
    | "layout"
    | "purpose"
    | "concern"
    | "timeline"
    | "strategy"
    | "source_evidence";
  content: string;
  confidence: number;
  sourceArtifactId: string;
};
```

## 推荐开场策略

Discovery 模块需要为后续 Conversion Agent 生成第一轮开场策略。

```ts
type OpeningStrategy = {
  angle: string;
  recommendedMessage: string;
  doNotMention: string[];
  requiredMemoryRefs: string[];
};
```

### 示例

```text
angle:
先承接“高新区三房 + 130 万预算”的问题，不要一开始索要联系方式。

recommendedMessage:
“我看到你在问高新区 130 万左右能不能买三房。这个预算要看具体板块和楼龄，我可以先帮你筛几个地铁近、总价可控的小区作为参考。”

doNotMention:
- 不要直接说“加微信”
- 不要夸大升值空间
- 不要承诺一定买得到
```

## Walrus Artifacts

Discovery 模块需要把关键过程存为 Walrus artifacts。

### Artifact 类型

```text
source_snapshot.json
comment_snapshot.json
keyword_strategy.json
post_relevance_report.json
lead_discovery_report.json
```

### source_snapshot.json

保存原始帖子来源。

```json
{
  "platform": "xhs",
  "sourceType": "post",
  "sourceUrl": "...",
  "sourceText": "...",
  "author": "...",
  "capturedAt": "...",
  "searchKeyword": "高新区三房"
}
```

### comment_snapshot.json

保存评论区线索来源。

```json
{
  "platform": "xhs",
  "sourceType": "comment",
  "postUrl": "...",
  "commentText": "130万能买高新区三房吗？",
  "commentAuthor": "...",
  "capturedAt": "..."
}
```

### lead_discovery_report.json

保存完整发现报告。

```json
{
  "workflowRunId": "...",
  "campaignId": "...",
  "leadId": "...",
  "sourceSnapshotBlobId": "...",
  "intent": {},
  "score": {},
  "memoryFacts": [],
  "openingStrategy": {},
  "modelMetadata": {}
}
```

## MemWal 输出

Discovery 模块写入 MemWal：

```text
客户初始画像
客户预算/区域/户型/顾虑
来源证据摘要
推荐开场策略
线索评分原因
```

每条 memory 应关联：

```text
leadId
campaignId
sourceArtifactBlobId
confidence
createdAt
```

## 数据库输出

数据库保存业务索引，而不是保存完整 artifact 原文。

### 需要创建或更新

```text
Campaign
SocialSource
Lead
LeadProfile
ArtifactRef
MemoryRef
TimelineEvent
WorkflowRun
```

### Lead 关键字段

```text
id
campaignId
platform
sourceType
sourceUrl
sourceAuthor
intentLevel
status = discovered
memorySpaceId
sourceArtifactBlobId
discoveryReportBlobId
createdAt
```

## Mastra Workflow

Discovery 模块建议实现为 Mastra workflow。

```text
1. loadCampaign
2. generateSearchKeywords
3. searchPlatformPosts
4. filterRelevantPosts
5. collectComments
6. identifyLeadCandidates
7. extractRealEstateIntent
8. scoreLead
9. storeSourceArtifactsToWalrus
10. createLeadRecord
11. createOrResolveMemWalMemorySpace
12. writeInitialMemoriesToMemWal
13. generateOpeningStrategy
14. storeDiscoveryReportToWalrus
15. emitTimelineEvent("Discovered")
```

## 后台定时发现与运行状态

发现模块与转化工作台解耦：**发现是后台任务，工作台只做已有线索的转化展示**。

### 运行模式

```text
1. 后台定时调度：Campaign.scheduleEnabled 开启后，每天在 scheduleTimes（默认 09:00 / 14:00 / 20:00，本地时区）各运行一次。
2. 手动触发：POST /api/campaigns/:campaignId/run（用于联调/补跑），与定时共用同一套运行逻辑。
```

调度器为 API 进程内调度（单进程、单实例）。进程启动时按各 Campaign 的 scheduleTimes 注册当天的触发点；不依赖外部 cron。

### 目标制（不设时间上限）

每次运行以"采集到 `Campaign.targetLeadCount` 条合格线索（intentLevel ≠ Ignore）"为目标，而非固定帖子数：

```text
循环：搜索一批 → 过滤相关 → 取详情(含评论) → 识别意向 → 抽取画像 → 合格则落库计数
直到 leadsCreated 达到 targetLeadCount，或搜索结果/关键词耗尽为止。
不设运行时间上限；maxPostsPerRun / maxCommentsPerPost 仅作为单批次的采集粒度上限。
```

### 去重

定时多次运行会命中重叠的搜索结果，必须去重，避免重复创建线索：

```text
去重键：platform + externalId（帖子用 feedId，评论用 commentId）。
已存在的线索跳过，不计入本次 leadsCreated，也不重复写 MemWal/Walrus。
```

### 运行状态记录（WorkflowRun）

每次发现运行 = 一条 `WorkflowRun`（type = discovery），全程持久化到数据库：

```text
status:      queued -> running -> succeeded | failed
campaignId:  关联的 Campaign
startedAt / completedAt / errorMessage
metadata(Json) 记录进度：{
  trigger: "schedule" | "manual",
  target: number,            // 本次目标条数
  searched: number,          // 已搜索帖子数
  relevant: number,          // 判定相关数
  leadsCreated: number,      // 本次新增合格线索数
  skipped: number,           // 跳过数（不相关/无意向/详情失败/重复）
  currentStep: string        // 当前步骤，便于运行中观察
}
```

运行历史通过 API 查询（`GET /api/campaigns/:campaignId/runs`、`GET /api/workflows/runs/:runId`）；MVP 阶段不单独做发现监控 UI，工作台保持转化聚焦。

### 持久化

`Campaign / Lead / LeadProfile / WorkflowRun / MemoryRef / ArtifactRef / TimelineEvent` 等业务状态落 **PostgreSQL（Prisma）**，数据库地址由 `DATABASE_URL` 配置，重启后运行记录与线索不丢。MemWal 长期记忆原文与 Walrus artifact 原文仍存外部服务，数据库只存索引/摘要。

## Dashboard 展示要求

Discovery 阶段在 Dashboard 里要展示：

```text
Campaign 名称
来源平台
来源类型：帖子 / 评论 / 博主 / 导入
搜索关键词
发现时间
意向等级
提取出的预算/区域/户型/顾虑
初始 MemWal memories
Walrus source snapshot blob ID
Walrus discovery report blob ID
Agent 判断原因
推荐开场策略
```

## MVP 必须实现

第一版必须支持：

- Campaign 创建
- 行业关键词配置
- 目标博主配置
- 小红书搜索帖子（依赖说明见下）
- 小红书评论区扫描（依赖说明见下）
- 手动导入真实文本

> **能力依赖说明**：现有 `mcp-xhs-chat` 只提供私聊四个工具（connect/disconnect/get_conversation/send），**不包含**搜索帖子和评论采集能力。"搜索帖子"和"评论区扫描"由开源 [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) 提供（`search_feeds` 关键词搜索、`get_feed_detail` 帖子详情含评论及子评论、`check_login_status` 登录态检查；streamable HTTP，默认 `http://localhost:18060/mcp`，浏览器扫码登录）。实现计划见 `docs/superpowers/plans/2026-06-12-leadflow-xhs-discovery-connector.md`。在该 connector 落地前，Discovery 的真实链路入口是"手动导入真实小红书文本"（技术选型文档已认可此路径，不算 mock）；不允许用预置假帖子代替搜索结果。
- LLM 生成搜索关键词
- LLM 判断帖子相关性
- LLM 识别评论意向
- Lead scoring
- DB 创建 lead
- MemWal 写入初始记忆
- Walrus 保存 source snapshot
- Walrus 保存 discovery report
- Dashboard 展示发现结果

## MVP 暂缓

第一版暂缓：

- 多平台 connector
- 自动翻页深度采集
- 多账号采集
- 图片 OCR
- 视频内容分析
- 大规模去重
- 复杂线索分配
- 自动私信触达

## 风险与边界

### 平台稳定性

小红书实时搜索和评论区采集可能受账号、频率、风控影响。

比赛 Demo 应支持手动导入真实内容作为兜底路径。

### 隐私

真实用户数据写入 Walrus 前必须脱敏或加密。

MVP 阶段建议避免上传：

- 手机号
- 微信号
- 真实姓名
- 精确住址
- 其他敏感个人信息

### 合规

本模块应定位为线索发现和业务分析工具，不应鼓励骚扰式营销。

后续 Conversion 模块需要加入：

- 频率限制
- 拒绝后停止跟进
- 黑名单
- 合规话术边界

## 最终定义

英文：

> Social Lead Discovery connects to social platforms, turns industry goals into search strategies, scans posts and comments for buying intent, and converts social signals into portable lead memory and verifiable artifacts.

中文：

> Social Lead Discovery 连接社交平台，把行业目标转化为搜索策略，扫描帖子和评论中的购买意向，并将社交信号转化为可携带的客户记忆和可验证 artifacts。
