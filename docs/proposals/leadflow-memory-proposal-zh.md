# LeadFlow Memory 项目方案

## 项目名称

**LeadFlow Memory**

## 项目副标题

**基于 Walrus/MemWal 的房产销售 Agent 可验证长期记忆工作流**

## 一句话介绍

LeadFlow Memory 让房产销售 Agent 从线索发现到多轮转化的全过程拥有可携带、可恢复、可验证的长期客户记忆。

## 项目背景

AI Agent 正在从一次性助手演变为长期运行的业务系统。但在真实销售场景中，Agent 仍然面临明显的记忆断层。

以房产销售为例，一个客户的决策周期往往持续数天到数周。销售 Agent 不仅要知道客户是否想买房，还需要长期记住客户预算、区域偏好、户型需求、学区要求、通勤距离、家庭结构、首付压力、历史顾虑和下一步跟进策略。

然而，当前很多 Agent 系统是割裂的：

- 线索发现 Agent 只负责寻找潜在客户。
- 转化 Agent 只负责私聊跟进。
- 数据库存储结构化字段，但不是 Agent 可以自然 recall 的语义记忆。
- Worker 重启、模型切换或任务重新分配后，上下文容易丢失。
- 很难验证 Agent 为什么判断某个客户是高意向，或为什么发送某条跟进消息。

## 核心问题

高客单价销售不是一次聊天，而是一个长期、连续、需要信任建立的工作流。

LeadFlow Memory 解决的问题是：

> 如何让不同 Agent 在从线索发现到客户转化的全过程中，共享同一份可验证、可恢复、可持续更新的客户记忆？

## 解决方案

LeadFlow Memory 使用 **MemWal** 作为 Agent 的长期语义记忆层，使用 **Walrus** 作为可验证 artifact 存储层。

系统连接两个 Agent 工作流：

```text
Lead Discovery Agent
发现潜在购房客户
-> 提取购房意图
-> 将客户长期记忆写入 MemWal
-> 将来源证据和评分报告存入 Walrus

Lead Conversion Agent
读取待跟进客户
-> 从 MemWal recall 客户上下文
-> 生成个性化私聊策略
-> 根据客户回复更新长期记忆
-> 将对话记录、执行 trace 和跟进报告存入 Walrus
```

## 参赛 Demo 场景

Demo 聚焦于房产销售。

Discovery Agent 从小红书内容中发现一个潜在购房客户：

> “想在高新区附近买个三房，预算别太高，最好通勤方便。”

Agent 提取出客户画像：

```text
预算：约 120-150 万
区域：高新区附近
户型：三房
购房目的：自住
核心顾虑：价格和通勤
推荐策略：优先推荐近地铁、总价可控的三房房源
```

这些信息会写入 MemWal，成为该客户的初始长期记忆。来源帖子、提取报告和意向评分报告会存入 Walrus。

随后，Conversion Agent 读取该客户，并从 MemWal recall 之前的记忆，生成个性化开场：

> “你之前提到想看高新区附近、通勤方便的三房，我先帮你筛几套总价可控的房源。”

客户进一步回复：

> “预算最好 130 万以内，孩子明年上小学。”

Agent 更新客户记忆：

```text
预算上限：130 万
新增优先级：学区
更新策略：推荐 130 万以内、兼顾地铁和学校的小区
```

之后模拟 Worker-1 宕机，Worker-2 接手同一个客户。Worker-2 从 MemWal 恢复上下文，并继续自然跟进：

> “我按你刚补充的 130 万以内、近学校和地铁的条件重新筛了一版。”

## 核心功能

### 1. Lead Memory Space

每个客户拥有一个长期 memory space，保存预算、区域、户型、家庭需求、顾虑、时间线、历史对话摘要和下一步跟进策略。

### 2. Cross-Agent Handoff

Discovery Agent 和 Conversion Agent 共享同一个客户上下文。不同 worker 也可以在任务中断后接手同一个客户，而不会丢失记忆。

### 3. Verifiable Artifact Trail

Walrus 保存每一步产生的 artifacts，包括来源证据、线索提取报告、意向评分报告、对话日志、Agent 执行 trace、跟进总结和 handoff 记录。

### 4. Memory Inspector Dashboard

Dashboard 展示客户完整生命周期：

```text
Discovered -> Scored -> Contacted -> Replied -> Memory Updated -> Handoff
```

每个事件都可以查看：

- 本次写入或读取的 MemWal memory
- 相关 Walrus artifact 和 blob ID
- Agent 决策原因
- Tool calls
- 当前跟进状态

## 为什么使用 Walrus / MemWal

MemWal 为 Agent 提供跨 session、跨 workflow、跨 worker 的可 recall 语义记忆。

Walrus 用于存储持久、可验证的 artifacts，证明记忆来自哪里、Agent 做过什么、每一步决策依据是什么。

没有 Walrus，这只是一个销售自动化 bot。使用 Walrus 和 MemWal 后，它变成了一个可恢复、可审计、可长期运行的 Agent 工作流。

## Walrus 赛道匹配

### Long-term Memory

客户的预算、区域、户型、学区、通勤、顾虑和跟进策略会跨多轮对话持续更新。

### Multi-Agent Coordination

Discovery Agent 和 Conversion Agent 通过同一个 customer memory space 共享上下文。

### Artifact-driven Workflow

来源证据、提取报告、评分报告、对话记录、推荐理由、执行 trace 都会作为 artifacts 存储到 Walrus。

### Persistent Data and File Access

后续 Agent 可以读取历史报告、聊天记录和来源证据，继续完成长期任务。

### Developer Tooling

Memory Inspector Dashboard 可用于 inspect、debug 和 manage Agent memory 与 Walrus artifacts。

## MVP 范围

比赛版本只实现一个完整闭环：

1. 导入或搜索 3 条房产线索。
2. Discovery Agent 提取客户购房意图。
3. 将客户初始记忆写入 MemWal。
4. 将来源证据和评分报告存入 Walrus。
5. Conversion Agent recall 客户记忆。
6. 生成个性化私聊话术。
7. 模拟客户回复并更新 MemWal。
8. 模拟 worker handoff。
9. Dashboard 展示 memory timeline、Walrus artifacts 和 Agent trace。

暂不纳入 MVP：

- 完整 CRM 系统
- 大规模真实爬取
- 多账号批量私聊
- 复杂权限系统
- 商业化付费模块

## 技术架构

```text
xhs-lead-crawler
├── lead-crawler-agent
├── mcp-xhs-search
├── mcp-db-writer
├── MemWal writer
└── Walrus artifact uploader

xhs-lead-converter
├── lead-converter-agent
├── mcp-db-reader
├── mcp-xhs-chat
├── MemWal recall/update
└── Walrus trace/report uploader

LeadFlow Dashboard
├── Lead timeline
├── Memory inspector
├── Artifact inspector
└── Agent trace viewer
```

## 未来扩展

LeadFlow Memory 可以从房产销售扩展到其他高决策成本销售场景：

- 汽车销售
- 装修服务
- 教育咨询
- 保险顾问
- B2B SaaS 销售
- 医疗美容咨询

行业可以变化，但核心工作流保持一致：

```text
discover lead -> extract intent -> store memory -> convert over time -> verify decisions
```

## 最终 Pitch

**中文：**

> LeadFlow Memory 让房产销售 Agent 从线索发现到多轮转化的全过程拥有可携带、可恢复、可验证的长期客户记忆。

**英文：**

> LeadFlow Memory gives real estate sales agents portable, verifiable long-term memory from lead discovery to multi-touch conversion, powered by Walrus and MemWal.
