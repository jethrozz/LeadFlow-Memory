import type { DashboardLeadDetail } from "./types";

export const CRASHED_DEMO_WORKER_ID = "worker_crashed_demo";

export type CrashRecoveryResult = {
  newWorker: string;
  summary: string;
};

function timeValue(iso?: string | null) {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function findCrashRecovery(
  detail: DashboardLeadDetail,
  baselineHandoffTs: number,
  crashStartedAtMs: number,
  fallbackSummary: string,
): CrashRecoveryResult | null {
  const recoveredEvent = detail.timeline
    .filter(
      (event) =>
        event.type === "handoff_recovered" &&
        timeValue(event.createdAt) > baselineHandoffTs,
    )
    .at(-1);

  if (recoveredEvent) {
    return {
      newWorker: recoveredEvent.workerId ?? detail.lead.workerId ?? "",
      summary: recoveredEvent.summary,
    };
  }

  const leadUpdatedAt = timeValue(detail.lead.updatedAt);
  const workerId = detail.lead.workerId;
  if (
    workerId &&
    workerId !== CRASHED_DEMO_WORKER_ID &&
    leadUpdatedAt >= crashStartedAtMs
  ) {
    return {
      newWorker: workerId,
      summary: fallbackSummary,
    };
  }

  return null;
}
