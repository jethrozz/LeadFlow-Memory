import { resolve } from "node:path";
import type { ConversionPlaybook } from "@leadflow/playbook";

const PLAYBOOKS_DIR = resolve(import.meta.dirname, "../../../playbooks");

export async function loadPlaybookForCampaign(
  campaign: Record<string, unknown>,
): Promise<ConversionPlaybook | undefined> {
  const playbookId = campaign.playbookId as string | undefined;
  if (!playbookId) return undefined;
  try {
    const { loadPlaybookFromFile } = await import("@leadflow/playbook");
    return await loadPlaybookFromFile(resolve(PLAYBOOKS_DIR, `${playbookId}.yml`));
  } catch {
    console.warn(`[playbook] '${playbookId}' not found, using default prompt`);
    return undefined;
  }
}
