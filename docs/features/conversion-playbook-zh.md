# Conversion Playbook 功能规格

## 模块定位

Conversion Playbook 是 LeadFlow Memory 中用于配置销售转化 Agent 行为的功能模块。

它的目标是：

> 让用户不用改代码，就能配置销售 Agent 的目标、话术规则、客户画像字段、行业知识和合规边界。

Conversion Playbook 本质上是：

```text
结构化配置
+ 系统提示词模板
+ 行业知识
+ 禁止规则
+ 成功标准
```

第一阶段用于房产销售 Demo，默认提供重庆房产销售 Playbook。

后续可扩展到：

- 汽车销售
- 装修服务
- 教育咨询
- 保险顾问
- B2B SaaS 销售

## 产品目标

Conversion Agent 不应该把目标和话术硬编码在代码中。

Playbook 需要支持：

- 配置 Agent 角色
- 配置转化目标
- 配置需要逐步采集的客户画像字段
- 配置对话规则
- 配置行业知识
- 配置禁止话术和合规边界
- 配置成功标准
- 后续支持多行业、多城市、多版本

## 第一阶段范围

第一阶段支持：

```text
YAML Playbook 配置
默认重庆房产销售 Playbook
Agent 每轮对话读取 Playbook
Dashboard 展示当前 Playbook 名称和关键规则
```

暂不做完整可视化编辑器。

## Playbook 使用场景

### 房产 Demo 默认目标

```text
主目标：
- 获取微信号
- 获取手机号
- 预约看房

过程目标：
- 了解预算
- 了解主要看房区域
- 了解面积/户型
- 了解新房或二手房偏好
- 了解清水或精装偏好
- 了解是否关注重庆新房补贴
- 了解看房时间
```

### 示例

客户说：

```text
130 万能买哪里？
```

Agent 不应该立刻索要微信，而是根据 Playbook 先补全关键画像：

```text
130 万在重庆不同区域选择差别挺大。你主要想看哪个区域，还是更看重通勤方便？
```

客户继续说：

```text
想看渝北，三房。
```

Agent 根据 Playbook 继续补充新房/二手、清水/精装、补贴兴趣：

```text
渝北三房可以看新房也可以看二手。你更倾向新房，还是二手能快点入住也接受？如果看新房，有些项目可能能叠加补贴，但要看具体楼盘政策。
```

客户表达强意向：

```text
有合适的发我看看。
```

Agent 再推进联系方式：

```text
可以，我先按渝北、130 万左右、三房给你筛一版。小红书这边发户型图和预算表不太方便，你留个微信或手机号，我发你详细对比。
```

## 配置内容

### 基础信息

```text
名称
行业
城市
适用平台
Agent 角色
语言风格
```

示例：

```text
名称：重庆房产销售 Playbook
行业：房产
城市：重庆
适用平台：小红书
Agent 角色：重庆房产顾问
语言风格：专业、自然、不推销感
```

### 转化目标

```text
主目标：
- 获取微信号
- 获取手机号
- 预约看房

次目标：
- 补全预算
- 补全区域
- 补全户型/面积
- 补全新房/二手偏好
- 补全清水/精装偏好
- 判断是否关注新房补贴
```

### 客户画像字段

Agent 需要逐步收集客户画像字段。

```text
预算
区域
面积
户型
新房/二手房
清水/精装
学区需求
通勤需求
补贴兴趣
看房时间
决策人
联系方式
```

字段配置结构：

```ts
type ProfileFieldConfig = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  priority: number;
  examples?: string[];
};
```

示例：

```yaml
- key: budget
  label: 预算
  required: true
  priority: 1
  description: 客户可接受的总价、首付或月供范围
  examples:
    - 130万以内
    - 首付40万
    - 月供不想太高
```

### 对话规则

```text
不要一开始就索要联系方式
每轮最多追问 1-2 个问题
先承接客户已表达的需求，再提出问题
客户表现强意向时，可以自然引导加微信或留电话
客户想看房时，优先确认区域和时间
客户连续拒绝 2 次后，停止推进联系方式
```

### 话术风格

```text
专业
自然
不油腻
不过度营销
像真实顾问，不像机器人
```

### 禁止事项

```text
不承诺学区
不夸大升值空间
不虚假宣传补贴
不说“保证买到”
不制造虚假紧迫感
不频繁骚扰
不在客户明确拒绝后继续索要联系方式
```

### 本地行业知识

重庆房产 Playbook 可以配置：

```text
重庆部分新房可能有补贴，但需要以具体楼盘和最新政策为准
如果客户关注预算，可以解释新房/二手房、清水/精装的成本差异
新房可能涉及交付周期，二手房更适合希望快速入住的客户
清水房总价可能低，但后续装修成本需要算入预算
精装房省事，但需要关注装修标准和维护情况
```

## 推荐 YAML 结构

第一阶段建议使用 YAML 文件保存 Playbook。

路径示例：

```text
playbooks/real-estate-chongqing.yml
```

完整示例：

```yaml
id: real-estate-chongqing
name: 重庆房产销售 Playbook
industry: real_estate
city: 重庆
platforms:
  - xhs

agent:
  role: 重庆房产顾问
  tone:
    - 专业
    - 自然
    - 不推销感
  objective: >
    通过多轮自然沟通了解客户需求，在合适时机获取微信号/手机号，
    或直接预约看房。

primary_goals:
  - get_wechat
  - get_phone
  - schedule_viewing

secondary_goals:
  - qualify_budget
  - qualify_district
  - qualify_layout
  - qualify_property_market
  - qualify_property_condition
  - qualify_subsidy_interest
  - qualify_viewing_time

profile_fields:
  - key: budget
    label: 预算
    required: true
    priority: 1
    description: 客户可接受的总价、首付或月供范围
  - key: district
    label: 看房区域
    required: true
    priority: 2
    description: 客户主要关注的重庆区域
  - key: layout
    label: 户型
    required: true
    priority: 3
    description: 几室几厅或面积需求
  - key: property_market
    label: 新房/二手
    required: false
    priority: 4
    description: 客户倾向新房还是二手房
  - key: property_condition
    label: 清水/精装
    required: false
    priority: 5
    description: 客户是否接受清水房或更偏好精装房
  - key: subsidy_interest
    label: 补贴兴趣
    required: false
    priority: 6
    description: 是否关注重庆新房补贴政策
  - key: contact
    label: 联系方式
    required: true
    priority: 99
    description: 微信号或手机号

conversation_rules:
  - 不要一开始就索要联系方式
  - 每轮最多追问 1-2 个问题
  - 先承接客户已表达的需求，再提出问题
  - 客户表达强意向时，可以自然引导加微信或留电话
  - 客户想看房时，优先确认看房区域和时间
  - 客户连续拒绝 2 次后，停止推进联系方式

forbidden_claims:
  - 不承诺学区结果
  - 不承诺一定享受补贴
  - 不夸大升值空间
  - 不制造虚假紧迫感
  - 不频繁骚扰客户

local_knowledge:
  - 重庆部分新房可能有补贴，但需要以具体楼盘和最新政策为准
  - 新房可能有补贴和更低首付活动，但要关注交付周期
  - 二手房更适合想快速入住或明确区域的客户
  - 清水房需要把装修成本计入预算
  - 精装房省事，但要关注装修标准和后期维护

success_criteria:
  get_wechat:
    description: 客户提供微信号，或同意添加微信
  get_phone:
    description: 客户提供手机号
  schedule_viewing:
    description: 客户确认看房区域和时间，并留下可联系渠道
```

## Agent 使用方式

每次生成回复前，Conversion Agent 会组合以下上下文：

```text
系统提示词
Playbook 配置
MemWal 客户记忆
当前聊天记录
已知客户画像字段
缺失客户画像字段
当前转化目标
```

然后输出：

```text
下一步动作
回复话术
决策原因
需要更新的客户记忆
是否达到转化目标
```

## Agent 输出结构

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

## 和 MemWal 的关系

Playbook 本身不保存客户记忆。

它决定：

- 哪些信息应该被识别为记忆
- 哪些画像字段优先补全
- 当前是否适合推进联系方式
- 应该如何解释行业知识

Conversion Agent 根据 Playbook 从对话中抽取新事实，并写入 MemWal。

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

## 和 Walrus 的关系

每轮基于 Playbook 的对话决策需要存为 Walrus artifact。

Artifact 类型：

```text
conversion_decision.json
conversation_log.json
memory_diff.json
followup_report.json
```

其中 `conversion_decision.json` 应包含：

```text
使用的 Playbook ID
Playbook 版本
读取的 MemWal memory refs
当前客户画像
缺失字段
下一步动作
生成话术
决策原因
模型信息
```

## Dashboard 展示要求

Dashboard 需要展示当前使用的 Playbook：

```text
Playbook 名称
行业/城市
主目标
当前客户缺失字段
本轮使用的对话规则
本轮命中的禁止规则检查
本轮 Agent 决策原因
```

在 Agent Trace 中应能看到：

```text
Loaded Playbook: real-estate-chongqing
Applied Rule: 不要一开始就索要联系方式
Missing Field: 新房/二手
Next Best Action: ask_property_market
```

## MVP 必须实现

第一版 Playbook 功能必须支持：

- YAML 配置
- 默认重庆房产 Playbook
- profile_fields 配置
- primary_goals / secondary_goals 配置
- conversation_rules 配置
- forbidden_claims 配置
- local_knowledge 配置
- success_criteria 配置
- Agent 每轮生成回复时读取 Playbook
- Dashboard 展示当前 Playbook 名称和关键规则

## MVP 暂缓

第一版暂缓：

- 可视化 Playbook 编辑器
- 多版本发布
- A/B 测试
- 权限审批
- 规则冲突检测
- Prompt 自动优化

## 后续扩展

后续产品化可支持：

- Playbook 管理页
- 字段配置表单
- 规则配置表单
- Prompt 预览
- 测试对话
- Playbook 版本管理
- 不同行业模板市场
- 团队审核流程

## 最终定义

英文：

> Conversion Playbook is the configurable brain of the sales agent. It defines the agent role, conversion goals, profile fields, conversation rules, local knowledge, and compliance boundaries without requiring code changes.

中文：

> Conversion Playbook 是销售 Agent 的可配置大脑，让用户无需改代码，就能调整行业目标、客户字段、跟进策略和合规边界。
