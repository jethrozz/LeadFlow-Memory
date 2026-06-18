# Conversion Agent 功能规格

## 模块定位

Conversion Agent 是 LeadFlow Memory 的线索转化跟进模块。

它承接 Discovery 模块发现的线索，基于 MemWal 长期客户记忆和 Conversion Playbook 配置，进行多轮自然沟通，逐步补全客户画像，并在合适时机推进转化目标。

核心定义：

> Conversion Agent 是一个基于可配置 Playbook 和长期客户记忆的销售转化 Agent，通过多轮沟通补全客户画像，并在合适时机获取手机号/微信号或预约看房。

## 核心目标

房产 Demo 的默认转化目标分为三类。

### 主目标

```text
获取手机号
获取微信号
预约看房
```

### 过程目标

```text
了解客户预算
了解主要看房区域
了解想买面积或户型
了解新房或二手房偏好
了解清水房或精装房偏好
了解是否关注重庆新房补贴
了解看房时间
了解决策人
```

### 成功标准

```text
获取联系方式：
- 客户提供手机号
- 客户提供微信号
- 客户同意添加微信

预约看房：
- 客户确认看房区域
- 客户确认看房时间
- 客户留下可联系渠道
```

如果客户暂时不想留联系方式，但愿意继续沟通，线索进入持续跟进状态。

如果客户明确拒绝多次，Agent 停止推进联系方式目标，避免骚扰。

## 和 Discovery 模块的关系

Discovery 模块负责：

```text
发现社交平台线索
提取初始购房意图
生成初始客户记忆
创建 lead
存储来源证据和发现报告
```

Conversion Agent 负责：

```text
读取已发现 lead
读取 Discovery 阶段写入的 MemWal 记忆
生成多轮跟进策略
执行私聊或生成跟进消息
解析客户回复
补全客户画像
更新 MemWal 记忆
保存 Walrus trace
推进联系方式或看房预约
```

## 和 Playbook 的关系

Conversion Agent 不硬编码行业目标和话术。

每轮生成回复前，Agent 会读取当前使用的 Conversion Playbook。

Playbook 决定：

```text
Agent 角色
转化目标
需要采集的客户画像字段
对话规则
本地行业知识
禁止话术
成功标准
```

例如重庆房产 Playbook 会告诉 Agent：

```text
不要一上来索要联系方式
每轮最多追问 1-2 个问题
客户强意向时可以自然引导加微信或留电话
重庆部分新房可能有补贴，但要以具体楼盘和最新政策为准
不承诺学区、不夸大升值、不虚假宣传补贴
```

## 和 mcp-xhs-chat 的关系

小红书私聊的真实执行通道由现有 `mcp-xhs-chat` 提供。

项目路径：

```text
/Users/jethrozz/Documents/UGit/lead-hunter-client/xhs-lead-converter/mcp-xhs-chat
```

该 MCP 服务已经提供以下工具：

```text
xhs_connect_device
xhs_disconnect_device
xhs_get_conversation
xhs_send_private_message
```

Conversion Agent 不需要重新实现小红书聊天自动化，而是通过 Mastra 的 MCPClient 调用这些工具。

### 获取聊天记录

```ts
xhs_get_conversation({
  device_id: string;
  xhs_user_id: string;
  xhs_username: string;
  since_time?: string;
});
```

返回：

```ts
{
  success: true;
  device_id: string;
  xhs_user_id: string;
  messages: ChatMessage[];
  total: number;
  raw_content?: string;
}
```

`raw_content` 是从小红书界面提取的原始内容。Conversion Agent 可以用 LLM 解析 `raw_content`，识别客户新回复和画像字段变化。

### 发送私信

```ts
xhs_send_private_message({
  device_id: string;
  xhs_user_id: string;
  xhs_username: string;
  message: string;
});
```

返回：

```ts
{
  success: true;
  device_id: string;
  xhs_user_id: string;
  message_sent: string;
  sent_at: string;
}
```

### 设备连接

```ts
xhs_connect_device({
  device_id: string;
  adb_address: string;
});
```

MVP 中需要保存 lead 对应的小红书身份信息：

```text
platform = xhs
xhs_user_id
xhs_username
```

同时需要保存或配置可用设备：

```text
device_id
adb_address
device status
```

### 执行策略

第一版 Conversion Agent 应支持两种执行方式：

```text
真实 MCP 通道：
通过 xhs_get_conversation 获取聊天记录，通过 xhs_send_private_message 发送消息。

人工兜底通道：
允许用户手动录入客户回复，或人工确认后再发送消息。
```

真实 MCP 通道是主路径，人工兜底用于 Demo 稳定性和外部平台不可用时的备选。

## Agent 每轮工作流

每次跟进时，Conversion Agent 需要完成以下步骤：

```text
1. 加载 lead 基础信息
2. 加载当前 Conversion Playbook
3. 从 MemWal recall 客户长期记忆
4. 通过 mcp-xhs-chat 获取当前聊天记录
5. 判断客户当前阶段
6. 判断已知画像字段和缺失画像字段
7. 判断当前是否适合索要联系方式或预约看房
8. 生成下一轮回复话术
9. 输出决策原因
10. 通过 mcp-xhs-chat 发送，或等待人工确认发送
11. 解析客户回复
12. 更新客户画像和 MemWal 记忆
13. 生成 Walrus trace artifacts
14. 更新 Dashboard 时间线
```

## 客户画像字段

房产 Demo 中，Conversion Agent 需要逐步补全以下客户画像字段：

```ts
type RealEstateLeadProfile = {
  budget?: string;
  areaSize?: string;
  layout?: string;
  preferredDistricts?: string[];
  propertyCondition?: "清水房" | "精装房" | "不限";
  propertyMarket?: "新房" | "二手房" | "不限";
  subsidyInterest?: boolean;
  commuteNeeds?: string;
  schoolNeeds?: string;
  timeline?: string;
  decisionMakers?: string[];
  contactInfo?: {
    phone?: string;
    wechat?: string;
  };
  viewingIntent?: {
    wantsViewing: boolean;
    preferredTime?: string;
  };
};
```

这些字段不应该像表单一样一次问完，而应在自然对话中逐步补全。

## 对话策略

### 基本原则

```text
先承接客户已表达的需求
不要一上来索要联系方式
每轮最多追问 1-2 个关键信息
优先提供对客户有用的信息，再推进下一步
客户表现强意向时，再自然引导联系方式或看房
客户拒绝后不要继续强推
```

### 示例一：客户需求模糊

客户说：

```text
130 万能买哪里？
```

Agent 回复：

```text
130 万在重庆不同区域选择差别挺大。如果你主要看新房，可以先关注有补贴或总价门槛低一点的板块；如果接受二手，选择会更灵活。你更想看哪个区域，还是主要按通勤来选？
```

目的：

```text
先提供价值
解释新房/二手差异
补全区域或通勤需求
暂不索要联系方式
```

### 示例二：客户补充区域和户型

客户说：

```text
想看渝北，最好三房。
```

Agent 回复：

```text
渝北三房的话，我会先看你更倾向新房还是二手。新房有些项目可能能叠加补贴，但交付时间和装修成本要一起算；二手更适合想快点入住。你是更想买清水自己装，还是精装省事一点？
```

目的：

```text
确认新房/二手偏好
确认清水/精装偏好
引入重庆新房补贴知识
继续补全画像
```

### 示例三：客户表达强意向

客户说：

```text
有合适的可以发我看看。
```

Agent 回复：

```text
可以，我先按渝北、130 万左右、三房给你筛一版。小红书这边发户型图和预算表不太方便，你留个微信或手机号，我把楼盘/小区对比和预算表发你。
```

目的：

```text
承接强意向
自然说明为什么需要联系方式
推进微信号或手机号
```

## Conversion Decision 输出

每轮 Agent 需要输出结构化决策结果，便于存储、调试和 Dashboard 展示。

```ts
type ConversionDecision = {
  stage:
    | "opening"
    | "qualifying"
    | "nurturing"
    | "asking_contact"
    | "scheduling_viewing"
    | "converted"
    | "paused"
    | "lost";

  missingProfileFields: string[];

  nextBestAction:
    | "ask_budget"
    | "ask_area"
    | "ask_layout"
    | "ask_property_market"
    | "ask_property_condition"
    | "explain_subsidy"
    | "recommend_options"
    | "ask_wechat"
    | "ask_phone"
    | "schedule_viewing"
    | "pause";

  message: string;
  rationale: string;
  memoryUpdates: LeadMemoryFact[];
  goalProgress: {
    achievedGoals: string[];
    pendingGoals: string[];
  };
};
```

## 阶段定义

### opening

首次联系或刚开始对话。

目标：

```text
承接来源需求
建立可信感
不要直接索要联系方式
```

### qualifying

客户愿意表达需求，但画像字段不完整。

目标：

```text
补全预算、区域、户型、新房/二手等关键信息
```

### nurturing

客户暂时不够明确，或还在观望。

目标：

```text
提供有用信息
保持低压跟进
等待更强意向信号
```

### asking_contact

客户已经表达较强意向，适合推进微信或手机号。

目标：

```text
自然解释为什么需要联系方式
获取微信号或手机号
```

### scheduling_viewing

客户明确想看房。

目标：

```text
确认区域、时间、联系方式
完成看房预约
```

### converted

已经拿到联系方式或完成看房预约。

### paused

客户暂时不方便、暂不考虑或需要等待。

### lost

客户明确拒绝，或多次拒绝后停止跟进。

## 记忆更新

每轮对话后，Agent 需要把新的客户事实写入 MemWal。

示例：

```text
客户预算：130 万以内
区域偏好：渝北
户型：三房
新房/二手：待确认
清水/精装：待确认
补贴兴趣：可能关注
下一步策略：询问新房/二手和装修偏好，再推进联系方式
```

记忆类型建议：

```text
budget
district
layout
area_size
property_market
property_condition
subsidy_interest
viewing_time
contact_info
objection
strategy
```

## Walrus Artifacts

每轮跟进需要保存可验证 artifacts。

### Artifact 类型

```text
conversation_log.json
conversion_decision.json
memory_diff.json
followup_report.json
```

### conversion_decision.json

保存本轮 Agent 决策。

内容包括：

```text
leadId
workflowRunId
playbookId
playbookVersion
recalledMemoryRefs
currentProfile
missingProfileFields
nextBestAction
generatedMessage
rationale
goalProgress
modelMetadata
createdAt
```

### memory_diff.json

保存本轮新增或更新的记忆。

内容包括：

```text
beforeProfile
afterProfile
newMemoryFacts
updatedMemoryFacts
sourceConversationRef
createdAt
```

### followup_report.json

保存本轮跟进总结。

内容包括：

```text
summary
customerIntentChange
profileCompleteness
recommendedNextStep
riskFlags
```

## Dashboard 展示要求

Conversion 阶段在 Dashboard 中需要展示：

```text
当前客户阶段
当前使用的 Playbook
已知客户画像
缺失客户画像字段
本轮读取的 MemWal memory
本轮生成的话术
Agent 决策原因
是否推进到联系方式或看房
Walrus artifact blob ID
下一步建议
```

在 Agent Trace 中应能看到：

```text
Loaded Playbook
MemWal recall
Missing fields detected
Next best action selected
Message generated
Customer reply parsed
Memory updated
Walrus artifacts stored
```

## MVP 必须实现

第一版 Conversion Agent 必须支持：

- 读取已发现 lead
- 读取 Conversion Playbook
- 从 MemWal recall 客户记忆
- 读取当前对话记录
- 生成下一轮跟进话术
- 解析客户回复
- 补全客户画像
- 判断是否适合索要联系方式或预约看房
- 判断是否达成转化目标
- 更新 MemWal 记忆
- 保存 Walrus trace artifacts
- Dashboard 展示本轮决策
- 通过 `mcp-xhs-chat` 读取小红书聊天记录
- 通过 `mcp-xhs-chat` 发送小红书私信

## MVP 暂缓

第一版暂缓：

- 真实楼盘推荐库
- 复杂房源报价系统
- 政策实时查询
- 自动群发
- 多销售团队管理
- 完整 CRM 管理能力
- 复杂 A/B 话术实验

## 风险与边界

### 合规边界

Agent 必须遵守 Playbook 中的禁止事项：

```text
不承诺学区
不夸大升值空间
不虚假宣传补贴
不频繁骚扰客户
客户拒绝后停止强推联系方式
```

### 频率控制

Conversion 模块后续需要支持：

```text
跟进间隔
最大跟进次数
连续拒绝次数
暂停跟进
黑名单
```

这些可以在调度模块或状态模型中进一步定义。

### 隐私保护

手机号、微信号和真实客户对话属于敏感信息。

写入 Walrus 前需要：

```text
脱敏
加密
或后续接入 Seal
```

比赛 MVP 建议使用脱敏演示数据。

## 最终定义

英文：

> Conversion Agent is a configurable sales follow-up agent that uses Playbook rules and long-term customer memory to qualify leads, generate multi-turn messages, update memory, and convert interested customers into contacts or viewing appointments.

中文：

> Conversion Agent 是一个可配置销售跟进 Agent，它基于 Playbook 规则和客户长期记忆进行多轮沟通，补全客户画像，并在合适时机获取联系方式或预约看房。
