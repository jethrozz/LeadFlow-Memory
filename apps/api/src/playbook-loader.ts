import { resolve } from "node:path";
import type { ConversionPlaybook } from "@leadflow/playbook";

const PLAYBOOKS_DIR = resolve(import.meta.dirname, "../../../playbooks");

// campaign 未指定 playbook 时的兜底 playbook（保证转化提示词始终来自 playbook，而非内置默认词）。
const DEFAULT_PLAYBOOK_ID = process.env.CONVERSION_PLAYBOOK_ID || "real-estate-chongqing";

export async function loadPlaybookForCampaign(
  campaign: Record<string, unknown>,
): Promise<ConversionPlaybook | undefined> {
  const playbookId = (campaign.playbookId as string) || DEFAULT_PLAYBOOK_ID;
  try {
    const { loadPlaybookFromFile } = await import("@leadflow/playbook");
    return await loadPlaybookFromFile(resolve(PLAYBOOKS_DIR, `${playbookId}.yml`));
  } catch (err) {
    // 兜底 playbook 都加载不到才会到这里——这是配置错误，要显著报错而不是静默退化。
    console.error(
      `[playbook] 加载 playbook '${playbookId}' 失败，转化将退回内置默认词：`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}
