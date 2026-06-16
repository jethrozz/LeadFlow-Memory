import type { ConversionPlaybook, ProfileFieldConfig } from "@leadflow/playbook";

// ── Discovery prompt ──────────────────────────────────────────────

/**
 * 根据 playbook 的 profile_fields 动态生成发现 prompt。
 * 无 playbook 时回退到默认的房产三字段。
 */
export function buildDiscoveryPrompt(profileFields?: ProfileFieldConfig[]): string {
  const fields = profileFields ?? [
    { key: "budget", label: "购房预算", required: true, priority: 1, description: "客户的总体购房预算范围" },
    { key: "location_preference", label: "区域偏好", required: true, priority: 2, description: "客户希望购房的区域或片区" },
    { key: "layout", label: "户型需求", required: false, priority: 3, description: "客户希望的房屋户型" },
  ];

  const sorted = [...fields].sort((a, b) => a.priority - b.priority);
  const fieldInstructions = sorted
    .map((f) => {
      const req = f.required ? "（必填）" : "（选填）";
      const examples = f.examples?.length ? `，例如：${f.examples.join("、")}` : "";
      return `  - ${f.key}: ${f.description}${req}${examples}`;
    })
    .join("\n");

  return [
    "你是 LeadFlow 线索发现 Agent。分析给定的帖子或评论内容，判断购房意向并抽取结构化画像。",
    "只返回一个 JSON 对象，字段如下：",
    "- intentLevel: 意向等级，取值 S/A/B/C/Ignore（S 最强，Ignore 表示无明确意向）。",
    "- summary: 一句话概括该线索的需求（中文，40 字以内）。",
    "- memory: 写入长期记忆的事实陈述（中文，尽量包含关键信息）。",
    `- extractedFields: 对象，按以下字段抽取；无法确定的字段直接省略，不要编造：`,
    fieldInstructions,
    "- needs: 字符串数组，核心需求标签；没有则返回 []。",
    "- concerns: 字符串数组，顾虑；没有则返回 []。",
    "严格依据内容判断，不要臆测内容里没有的信息。",
  ].join("\n");
}

// 默认 prompt（无 playbook 时的向后兼容）
export const discoverySystemPrompt = buildDiscoveryPrompt();

// ── Conversion prompt ─────────────────────────────────────────────

// 始终生效的基线规则（无论是否配置 playbook）：真人微信口吻、短、被拒退让。
const STYLE_RULE =
  "- 像真人发微信，口语、简短，控制在 20 字以内（最多 30 字），一次只说一件事，不要长篇大论、不要罗列条目。";
const BACKOFF_RULES = [
  "- 客户拒绝或回避加微信/留联系方式时，不要反复索要；先尊重，可改成「直接在小红书给您发」继续提供价值。",
  "- 客户明确说不需要/不感兴趣/别发了，就把 outcome 标为 rejected，不要继续纠缠。",
].join("\n");

export function buildConversionPrompt(
  playbook?: ConversionPlaybook,
  mode: "reply" | "opening" = "reply",
): string {
  const role = playbook?.agent?.role ?? "销售顾问";
  const tone = playbook?.agent?.tone ?? "专业、亲切";
  const objective = playbook?.agent?.objective ?? "了解客户需求，建立信任关系";

  const playbookRules = playbook?.conversation_rules?.length
    ? playbook.conversation_rules.map((r) => `- ${r}`).join("\n")
    : "- 提问不超过 3 个，避免让客户感到被审问\n- 以一个明确的下一步行动结束";

  const forbidden = playbook?.forbidden_claims?.length
    ? `\n禁止事项：\n${playbook.forbidden_claims.map((r) => `- ${r}`).join("\n")}`
    : "";

  if (mode === "opening") {
    return [
      `你是${role}。语气${tone}。目标：${objective}`,
      "",
      "规则：",
      STYLE_RULE,
      playbookRules,
      forbidden,
      "",
      "这是首次主动触达客户，请基于已知客户画像写一句自然简短的开场白，不要假设客户说过的话。",
      "返回 JSON：{ message, memory, extractedFields }",
      "message 为开场白，memory 为写入长期记忆的事实，extractedFields 为画像字段。",
    ].join("\n");
  }

  const goals = playbook?.success_criteria?.length
    ? playbook.success_criteria.map((g) => `- ${g}`).join("\n")
    : "- 拿到客户的微信或电话联系方式\n- 或客户明确同意线下/视频看房";

  return [
    `你是${role}。语气${tone}。目标：${objective}`,
    "",
    "规则：",
    STYLE_RULE,
    BACKOFF_RULES,
    playbookRules,
    forbidden,
    "",
    "本次对话的成功目标（满足任一即算达成）：",
    goals,
    "",
    "请判断当前对话状态并返回 JSON：{ message, memory, extractedFields, outcome }",
    'outcome 取值："goal_reached"（客户已满足上述目标）、"rejected"（客户明确拒绝/不感兴趣/明说不加微信不看房）、"continue"（仍在沟通中）。',
    "message 为回复话术（务必简短），memory 为写入长期记忆的事实，extractedFields 为本次抽取的画像字段。",
  ].join("\n");
}

export const conversionSystemPrompt = buildConversionPrompt();

// ── Handoff prompt ────────────────────────────────────────────────

export const handoffSystemPrompt = [
  "You are LeadFlow Handoff Recovery Agent.",
  "Return JSON with recoverySummary based only on recalled memory.",
  "Mention what context was recovered and what the next worker should do.",
].join("\n");
