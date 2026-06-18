# Handoff Recovery 功能规格

## 模块定位

Handoff Recovery 是 LeadFlow Memory 的长期记忆恢复与 Agent 接力模块。

它的目标是：

> 当原 Agent/Worker 中断、重启、切换模型或任务重新分配时，新的 Agent/Worker 可以从 MemWal 恢复客户长期记忆，并通过 Walrus artifacts 理解之前发生了什么，从而继续自然跟进。

Handoff Recovery 是参赛 Demo 中最能体现 Walrus/MemWal 价值的模块之一。

## 核心问题

长期销售 Agent 会遇到很多中断：

```text
Worker 崩溃
Agent 重启
模型切换
任务重新分配
原销售顾问下线
系统升级
多 Agent 接力
```

如果没有长期记忆，新 Agent 很容易出现：

```text
重复问客户已经回答过的问题
忘记客户预算和区域
不知道为什么上一次要推进联系方式
不知道客户是否拒绝过
无法解释之前 Agent 的判断
```

Handoff Recovery 解决的是：

> 新 Agent 接手时，不只是恢复聊天记录，而是恢复客户记忆、决策上下文和下一步策略。

## 触发方式

### 自动触发

```text
Worker 心跳超时
Workflow 执行失败
Agent 进程重启
任务超时未处理
当前 Worker 达到负载上限
```

### 人工触发

```text
运营人员点击“转交给新 Agent”
销售人员点击“接手”
管理员点击“恢复任务”
```

### Demo 触发

比赛 Demo 里需要提供一个按钮：

```text
模拟 Worker-1 中断
-> Worker-2 接手
-> 从 MemWal 恢复
-> 从 Walrus 读取历史 artifacts
-> 生成下一轮自然跟进
```

Dashboard 原型中的 `回放接力恢复` 就是这个能力的入口。

## 恢复数据来源

Handoff Recovery 需要从四类来源恢复上下文。

### 1. 数据库

数据库提供业务状态和索引：

```text
leadId
当前 lead 状态
当前负责 worker
上一次 workflow run
最近一次对话时间
memorySpaceId
artifact refs
```

数据库不负责长期语义记忆，也不保存完整 artifact 原文。

### 2. MemWal

MemWal 恢复客户长期语义记忆：

```text
客户预算
主要区域
户型/面积
新房/二手偏好
清水/精装偏好
学区/通勤需求
是否关注补贴
是否已经拒绝过联系方式
下一步跟进策略
```

### 3. Walrus

Walrus 恢复可验证历史证据：

```text
source_snapshot
lead_discovery_report
conversation_log
conversion_decision
memory_diff
followup_report
```

### 4. Conversion Playbook

Playbook 告诉新 Agent 当前行业目标和对话边界：

```text
当前行业目标是什么
哪些字段必须补全
什么情况下可以要微信/手机号
什么情况下可以预约看房
哪些话不能说
成功标准是什么
```

## Handoff Recovery Plan

恢复后，系统需要生成一个接手计划。

Handoff Recovery 不只是“读数据”，还要告诉新 Agent 下一步怎么继续。

```ts
type HandoffRecoveryPlan = {
  leadId: string;
  previousWorkerId: string;
  newWorkerId: string;
  triggerReason:
    | "worker_timeout"
    | "workflow_failed"
    | "manual_transfer"
    | "model_switch"
    | "demo_trigger";
  recoveredProfile: RealEstateLeadProfile;
  recalledMemorySummary: string;
  lastConversationSummary: string;
  previousDecisionSummary: string;
  nextBestAction: string;
  recommendedMessage: string;
  riskFlags: string[];
  proofArtifacts: Array<{
    artifactType: string;
    blobId: string;
  }>;
};
```

### 示例

```text
恢复画像：
客户预算 130 万以内，关注渝北三房，可能关心学区和地铁，尚未确认新房/二手。

上次决策：
Worker-1 判断客户已表达强意向，但还没留下联系方式。

下一步动作：
先按渝北、130 万、三房承接需求，再自然引导留微信发送房源对比。

推荐消息：
“我按你刚补充的 130 万以内、渝北三房重新筛了一版。小红书这边发户型和预算表不太方便，你留个微信，我把对比表发你。”
```

## Handoff Workflow

Handoff Recovery 建议实现为 Mastra workflow。

```text
1. detectHandoffNeed
2. lockLeadForRecovery
3. loadLeadStateFromDb
4. recallMemWalMemory
5. loadWalrusArtifacts
6. summarizePreviousContext
7. loadConversionPlaybook
8. generateRecoveryPlan
9. assignNewWorker
10. storeHandoffProofToWalrus
11. writeRecoveryMemoryToMemWal
12. emitTimelineEvent("handoff_recovered")
```

## Walrus Handoff Proof

每次接力恢复都必须生成一个 Walrus artifact：

```text
handoff_proof.json
```

这个 artifact 是证明恢复过程的关键。

### handoff_proof.json 内容

```json
{
  "leadId": "...",
  "previousWorkerId": "worker-1",
  "newWorkerId": "worker-2",
  "triggerReason": "worker_timeout",
  "recalledMemoryRefs": ["..."],
  "loadedArtifactRefs": ["..."],
  "recoveredProfile": {},
  "previousDecisionSummary": "...",
  "nextBestAction": "ask_wechat",
  "recommendedMessage": "...",
  "createdAt": "..."
}
```

### 价值

```text
不只是恢复了客户上下文
还能证明系统是如何恢复的
能说明读取了哪些 memory
能说明参考了哪些 Walrus artifacts
能说明为什么生成当前接力话术
```

## MemWal 输出

Handoff Recovery 完成后，也需要向 MemWal 写入一条恢复相关记忆。

示例：

```text
系统在 Worker-1 超时后由 Worker-2 接手。
恢复时读取到客户预算 130 万以内、渝北三房、关注学区和地铁。
下一步策略是索要微信发送房源对比。
```

这可以帮助后续 Agent 理解发生过一次接力。

## Dashboard 展示要求

Dashboard 需要把接力恢复作为高光事件展示。

### Timeline Event

```text
事件：接力恢复
Agent：转化 Worker-2
原因：Worker-1 心跳超时
结果：已从 MemWal 恢复 5 条客户记忆
证明：handoff_proof.json 已上传 Walrus
```

### Inspector 面板

展示：

```text
Recovered memories:
- 预算：130 万以内
- 区域：渝北
- 户型：三房
- 需求：近学校/地铁
- 下一步：索要微信发送房源对比

Walrus proof:
- conversation_log.json
- memory_diff.json
- handoff_proof.json

Next message:
- Worker-2 生成的接力话术
```

### Agent Trace

展示：

```text
loadLeadStateFromDb
memwal.recall
walrus.readArtifacts
summarizePreviousContext
loadConversionPlaybook
generateRecoveryPlan
storeHandoffProofToWalrus
emitTimelineEvent
```

## Demo 剧本

比赛现场建议这样演示：

```text
1. Discovery Agent 从评论区发现客户：130 万预算，想看渝北三房。
2. Conversion Worker-1 根据记忆跟进客户。
3. 客户回复：孩子明年上学，最好近学校。
4. Worker-1 更新 MemWal，并将对话和 memory diff 存 Walrus。
5. 点击“模拟 Worker-1 中断”。
6. Worker-2 接手。
7. 系统从 MemWal recall 客户长期记忆。
8. 系统从 Walrus 读取上一轮对话和决策 trace。
9. Worker-2 生成自然接力话术。
10. Dashboard 展示 handoff proof blob ID。
```

## MVP 必须实现

第一版 Handoff Recovery 必须支持：

- 手动触发 Worker handoff
- 读取 lead 状态
- 读取 MemWal 记忆
- 读取最近 Walrus artifact refs
- 生成 recovery plan
- 生成推荐跟进话术
- 写入 `handoff_proof.json` 到 Walrus
- 写入恢复事件到 MemWal
- Dashboard 展示接力恢复事件

## MVP 暂缓

第一版暂缓：

- 真实 Worker 心跳检测
- 复杂任务锁
- 自动故障转移
- 多 Worker 调度算法
- 跨模型恢复评估
- 人工审批流

## 风险与边界

### 并发和锁

后续如果多个 Worker 同时尝试恢复同一 lead，需要任务锁和幂等控制。

MVP 可以先用手动触发和单 lead 演示，暂不做复杂并发。

### 记忆可信度

恢复时不应盲目信任所有 memory。

后续可加入：

```text
memory confidence
source artifact ref
last updated time
conflict detection
```

### 敏感信息

如果恢复内容中包含手机号、微信号或真实聊天记录，上传 Walrus 前应加密或脱敏。

后续可接入 Seal 做隐私层。

## 模块价值

### 对业务用户

```text
销售跟进不中断
换人接手不丢上下文
客户不会被重复追问
```

### 对开发者

```text
Agent workflow 可恢复
历史决策可审计
失败后能解释恢复路径
```

### 对 Walrus 赛道

```text
Long-term memory:
MemWal 恢复客户记忆

Artifact-driven workflow:
Walrus 保存恢复证据

Multi-agent coordination:
Worker-1 到 Worker-2 接力

Developer tooling:
Dashboard 可 inspect 恢复过程
```

## 最终定义

英文：

> Handoff Recovery lets a new agent resume a long-running sales workflow after interruption by recalling customer memory from MemWal and verifying prior context through Walrus artifacts.

中文：

> Handoff Recovery 让新的 Agent 在中断后通过 MemWal 恢复客户长期记忆，并通过 Walrus artifacts 验证历史上下文，从而继续自然跟进。
