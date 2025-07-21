import * as cronflowFunctions from './cronflow';

export const cronflow = {
  define: cronflowFunctions.define,

  start: cronflowFunctions.start,

  stop: cronflowFunctions.stop,

  trigger: cronflowFunctions.trigger,

  inspect: cronflowFunctions.inspect,

  executeManualTrigger: cronflowFunctions.executeManualTrigger,

  executeWebhookTrigger: cronflowFunctions.executeWebhookTrigger,

  executeScheduleTrigger: cronflowFunctions.executeScheduleTrigger,

  getTriggerStats: cronflowFunctions.getTriggerStats,

  getWorkflowTriggers: cronflowFunctions.getWorkflowTriggers,

  unregisterWorkflowTriggers: cronflowFunctions.unregisterWorkflowTriggers,

  getScheduleTriggers: cronflowFunctions.getScheduleTriggers,

  getWorkflows: cronflowFunctions.getWorkflows,

  getWorkflow: cronflowFunctions.getWorkflow,

  getEngineState: cronflowFunctions.getEngineState,

  isRustCoreAvailable: cronflowFunctions.isRustCoreAvailable,

  replay: cronflowFunctions.replay,

  resume: cronflowFunctions.resume,

  cancelRun: cronflowFunctions.cancelRun,

  publishEvent: cronflowFunctions.publishEvent,

  // State management functions
  getGlobalState: cronflowFunctions.getGlobalState,
  setGlobalState: cronflowFunctions.setGlobalState,
  incrGlobalState: cronflowFunctions.incrGlobalState,
  deleteGlobalState: cronflowFunctions.deleteGlobalState,
  getWorkflowState: cronflowFunctions.getWorkflowState,
  setWorkflowState: cronflowFunctions.setWorkflowState,
  incrWorkflowState: cronflowFunctions.incrWorkflowState,
  deleteWorkflowState: cronflowFunctions.deleteWorkflowState,
  getStateStats: cronflowFunctions.getStateStats,
  cleanupExpiredState: cronflowFunctions.cleanupExpiredState,
};

export type { WorkflowDefinition } from './workflow/types';
export type { Context } from './workflow/types';
export type { StepDefinition, StepOptions } from './workflow/types';
export type { TriggerDefinition } from './workflow/types';

export { WorkflowDefinitionSchema } from './workflow/validation';

export * from './workflow';

export * from './state';
