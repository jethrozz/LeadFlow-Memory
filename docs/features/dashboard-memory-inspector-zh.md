# Dashboard / Memory Inspector 功能规格

## 模块定位

Dashboard / Memory Inspector 是 LeadFlow Memory 的可视化控制台。

它既是业务用户使用的销售工作台，也是比赛 Demo 中向评委展示 Walrus/MemWal 价值的核心界面。

核心定义：

> Dashboard 用来展示线索生命周期、客户长期记忆、Walrus artifacts、Agent 决策 trace 和 Handoff Recovery 过程。

## 目标用户

### 业务用户

业务用户关心：

```text
有哪些线索
客户想买什么
客户现在跟进到哪一步
下一步应该怎么跟
是否已经拿到联系方式或预约看房
```

### 评委 / 开发者

评委和开发者关心：

```text
Agent 读了哪些记忆
Agent 为什么这么回复
哪些 artifacts 存到了 Walrus
handoff 时新 Agent 如何恢复上下文
整个 Agent workflow 是否可解释、可验证、可恢复
```

## 核心问题

Dashboard 需要回答 6 个问题：

```text
这个线索从哪里来？
客户现在是什么状态？
Agent 记住了什么？
Agent 为什么这么回复？
哪些证据存到了 Walrus？
如果发生接力，新的 Agent 如何恢复上下文？
```

## 页面结构

MVP 只做一个主页面：

```text
LeadFlow Dashboard
```

推荐布局：

```text
左侧：Lead 列表
中间：Lead Profile + Memory Timeline
右侧：Next Follow-up + Inspector
```

该布局已经体现在当前原型中，后续正式实现时可沿用。

## 左侧 Lead 列表

Lead 列表展示所有线索，并支持基础状态筛选。

### 展示字段

```text
客户名称 / 平台昵称
来源平台
来源类型：帖子 / 评论 / 博主 / 导入
意向等级：S / A / B / C
当前状态
关键需求摘要
最后更新时间
```

### 状态筛选

```text
新线索
跟进中
已回复
接力中
已转化
已暂停
已流失
```

### 交互

```text
点击 lead 后切换当前详情
列表中高亮当前选中 lead
按状态筛选 lead
```

## Lead Profile

Lead Profile 展示当前客户画像。

### 房产 Demo 字段

```text
预算
区域
户型 / 面积
新房 / 二手
清水 / 精装
学区需求
通勤需求
补贴兴趣
看房时间
联系方式状态
```

### 辅助信息

```text
来源信号
最近客户回复
当前推荐策略
当前负责 Worker
当前使用的 Playbook
```

## Memory Timeline

Memory Timeline 是 Dashboard 的核心区域。

它不是普通聊天记录，而是完整 Agent workflow 的事件时间线。

### Timeline 事件类型

```text
Discovered
Scored
Memory Written
Contacted
Customer Replied
Memory Updated
Contact Requested
Handoff Recovered
Viewing Scheduled
Converted
Paused
Lost
```

### 每个事件展示字段

```text
时间
Agent / Worker
事件类型
事件摘要
关联 memory refs
关联 Walrus artifact blob IDs
```

### 交互

```text
点击 timeline event
右侧 Inspector 根据当前事件更新内容
高亮关键事件，例如 Handoff Recovered
```

## Inspector Tabs

右侧 Inspector 用于查看当前 lead 或当前 timeline event 的详细上下文。

建议第一版包含 4 个 tab。

## Tab 1: MemWal Memory

展示当前客户长期记忆。

### 示例内容

```text
预算：130 万以内
区域：渝北
户型：三房
新房/二手：待确认
清水/精装：待确认
补贴兴趣：可能关注
下一步策略：索要微信发送房源对比
```

### 每条 memory 展示字段

```text
memory 类型
内容
置信度
来源事件
最近更新时间
source artifact
```

## Tab 2: Walrus Artifacts

展示当前 lead 关联的 Walrus artifacts。

### Artifact 类型

```text
source_snapshot.json
lead_discovery_report.json
conversation_log.json
conversion_decision.json
memory_diff.json
handoff_proof.json
followup_report.json
```

### 展示字段

```text
artifact 类型
blob ID
创建时间
关联事件
验证状态
```

### 交互

```text
复制 blob ID
查看 artifact 摘要
跳转或展开 artifact 详情
```

## Tab 3: Agent Trace

展示 Agent 本轮决策过程。

### 示例内容

```text
加载 Playbook
读取 MemWal memory
读取聊天记录
检测缺失字段
选择 next best action
生成回复
更新 memory
上传 Walrus artifact
```

### 展示字段

```text
步骤名称
工具调用
输入摘要
输出摘要
耗时
状态
```

### 价值

Agent Trace 是给评委和开发者看的，用来证明系统不是普通 CRM，而是一个可解释的 Agent workflow。

## Tab 4: Playbook

展示当前使用的 Conversion Playbook 摘要。

### 展示内容

```text
行业：房产
城市：重庆
主目标：获取微信 / 手机号 / 预约看房
关键字段：预算、区域、户型、新房/二手、清水/精装
对话规则：不要一上来索要联系方式，每轮最多问 1-2 个问题
禁止事项：不承诺学区、不夸大升值、不虚假宣传补贴
```

### 价值

让用户和评委理解 Agent 当前遵循什么销售目标和合规边界。

## Next Follow-up 面板

Next Follow-up 展示 Agent 推荐下一步如何跟进。

### 展示内容

```text
当前 Worker
下一步动作
推荐话术
使用了哪些记忆
为什么现在适合这样说
是否建议人工确认
```

### 示例

```text
下一步动作：ask_wechat

推荐话术：
“我按你刚补充的 130 万以内、渝北三房重新筛了一版。小红书这边发户型和预算表不太方便，你留个微信，我把对比表发你。”

使用记忆：
- 预算 130 万以内
- 区域渝北
- 三房
- 孩子明年上学
```

## 关键操作

MVP 页面至少支持：

```text
选择不同 lead
切换 timeline event
切换 Inspector tab
触发 Conversion 下一步
触发 Handoff Recovery
查看 Walrus blob ID
查看 MemWal memory
```

可选操作：

```text
人工确认发送话术
手动暂停 lead
标记已获取微信
标记已预约看房
重新运行分析
```

## 比赛 Demo 流程

Dashboard 要支持一个清晰的 1-2 分钟演示流程。

```text
1. 选中一个房产 lead
2. 展示它来自小红书评论
3. 展示 Discovery Agent 提取的初始记忆
4. 展示 Conversion Agent 如何基于记忆生成跟进话术
5. 模拟客户回复
6. 展示 MemWal memory 更新
7. 点击“回放接力恢复”
8. 展示 Worker-2 从 MemWal 恢复上下文
9. 展示 handoff_proof.json 的 Walrus blob ID
10. 展示下一条自然接力话术
```

## 和其他模块的关系

### 和 Social Lead Discovery

Dashboard 展示 Discovery 模块产生的：

```text
来源平台
来源类型
搜索关键词
线索评分
初始客户记忆
source snapshot blob ID
discovery report blob ID
```

### 和 Conversion Agent

Dashboard 展示 Conversion Agent 产生的：

```text
下一步动作
推荐话术
客户画像补全
决策原因
memory diff
followup report
```

### 和 Conversion Playbook

Dashboard 展示当前 Playbook：

```text
Playbook 名称
目标
字段
规则
禁止事项
```

### 和 Handoff Recovery

Dashboard 展示：

```text
接力原因
恢复的 memories
读取的 artifacts
handoff proof blob ID
新 Worker 推荐话术
```

## MVP 必须实现

第一版 Dashboard 必须包含：

- Lead 列表
- Lead Profile
- Memory Timeline
- MemWal Memory tab
- Walrus Artifacts tab
- Agent Trace tab
- Playbook tab
- Next Follow-up 面板
- Handoff Recovery 高光事件
- 真实 blob ID 展示

## MVP 暂缓

第一版暂缓：

- 复杂统计报表
- 团队权限管理
- 多账号管理
- 批量操作
- 客户筛选高级条件
- 完整 CRM kanban
- 移动端适配
- 复杂图表

## 设计原则

### 不是普通 CRM

Dashboard 不应只展示客户列表和聊天记录。

必须突出：

```text
MemWal memory
Walrus artifacts
Agent trace
Handoff recovery
```

### 同时服务业务和评委

业务用户需要快速理解客户状态。

评委需要快速看懂 Walrus/MemWal 在 Agent workflow 中的作用。

### 高光接力恢复

Handoff Recovered 应该是 timeline 中最醒目的事件之一。

这是 Demo 中最能体现长期记忆和可验证 artifacts 价值的部分。

## 模块价值

### 对业务用户

```text
看得懂客户是谁
看得懂客户想要什么
看得懂下一步怎么跟
```

### 对开发者

```text
看得懂 Agent 为什么这么做
看得懂哪里出了问题
看得懂记忆和 artifacts 是否正确
```

### 对评委

```text
一眼看到 Walrus/MemWal 不是装饰
而是真正参与了 Agent workflow
```

## 最终定义

英文：

> Dashboard / Memory Inspector visualizes the lead lifecycle, customer memory, Walrus artifacts, agent traces, and handoff recovery process so users and judges can inspect how long-running sales agents remember, decide, and recover.

中文：

> Dashboard / Memory Inspector 将线索生命周期、客户长期记忆、Walrus artifacts、Agent 决策 trace 和接力恢复过程可视化，让用户和评委都能看懂长期销售 Agent 如何记住、决策和恢复。
