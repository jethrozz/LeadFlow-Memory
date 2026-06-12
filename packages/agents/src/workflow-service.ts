import { runConversionWorkflow } from "./conversion-workflow.js";
import { runDiscoveryWorkflow } from "./discovery-workflow.js";
import { runHandoffRecoveryWorkflow } from "./handoff-workflow.js";
import type { WorkflowServices } from "./types.js";

export function createWorkflowService(services: WorkflowServices) {
  return {
    runDiscovery: (input: Parameters<typeof runDiscoveryWorkflow>[1]) =>
      runDiscoveryWorkflow(services, input),
    runConversion: (input: Parameters<typeof runConversionWorkflow>[1]) =>
      runConversionWorkflow(services, input),
    runHandoffRecovery: (input: Parameters<typeof runHandoffRecoveryWorkflow>[1]) =>
      runHandoffRecoveryWorkflow(services, input),
  };
}
