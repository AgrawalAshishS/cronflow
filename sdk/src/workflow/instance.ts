import {
  WorkflowDefinition,
  StepDefinition,
  TriggerDefinition,
  StepOptions,
  Context,
  RetryConfig,
  CacheConfig,
} from './types';
import { validateWorkflow } from './validation';
import { parseDuration, generateId } from '../utils';
import { createTestHarness } from '../testing/harness';
import {
  createAdvancedTestHarness,
  AdvancedTestHarness,
} from '../testing/advanced';

export class WorkflowInstance {
  private _workflow: WorkflowDefinition;
  private _currentStep: StepDefinition | null = null;
  private _stepStack: StepDefinition[] = [];

  private _controlFlowStack: Array<{
    type: 'if' | 'elseIf' | 'else';
    name: string;
    condition?: (ctx: Context) => boolean | Promise<boolean>;
    startIndex: number;
  }> = [];

  constructor(
    workflow: WorkflowDefinition,
    private readonly _cronflowInstance: any // Will be typed properly later
  ) {
    this._workflow = workflow;
  }

  test() {
    return createTestHarness(this._workflow);
  }

  advancedTest(): AdvancedTestHarness {
    return createAdvancedTestHarness(this._workflow);
  }

  step(
    name: string,
    handlerFn: (ctx: Context) => any | Promise<any>,
    options?: StepOptions
  ): WorkflowInstance {
    const step: StepDefinition = {
      id: name,
      name,
      handler: handlerFn,
      type: 'step',
      options,
    };

    this._workflow.steps.push(step);
    this._currentStep = step;
    this._stepStack.push(step);

    return this;
  }

  action(
    name: string,
    handlerFn: (ctx: Context) => any | Promise<any>,
    options?: StepOptions
  ): WorkflowInstance {
    const step: StepDefinition = {
      id: name,
      name,
      handler: handlerFn,
      type: 'action',
      options,
    };

    this._workflow.steps.push(step);
    this._currentStep = step;
    this._stepStack.push(step);

    return this;
  }

  retry(options: RetryConfig): WorkflowInstance {
    if (!this._currentStep) {
      throw new Error('No current step. Call .step() or .action() first.');
    }

    if (!this._currentStep.options) {
      this._currentStep.options = {};
    }

    this._currentStep.options.retry = options;
    return this;
  }

  timeout(duration: string | number): WorkflowInstance {
    if (!this._currentStep) {
      throw new Error('No current step. Call .step() or .action() first.');
    }

    if (!this._currentStep.options) {
      this._currentStep.options = {};
    }

    this._currentStep.options.timeout = duration;
    return this;
  }

  cache(config: CacheConfig): WorkflowInstance {
    if (!this._currentStep) {
      throw new Error('No current step. Call .step() or .action() first.');
    }

    if (!this._currentStep.options) {
      this._currentStep.options = {};
    }

    this._currentStep.options.cache = config;
    return this;
  }

  delay(duration: string | number): WorkflowInstance {
    if (!this._currentStep) {
      throw new Error('No current step. Call .step() or .action() first.');
    }

    if (!this._currentStep.options) {
      this._currentStep.options = {};
    }

    this._currentStep.options.delay = duration;
    return this;
  }

  onWebhook(path: string, options?: any): WorkflowInstance {
    const trigger: TriggerDefinition = {
      type: 'webhook',
      path,
      options,
    };

    this._workflow.triggers.push(trigger);
    return this;
  }

  onSchedule(cronExpression: string): WorkflowInstance {
    const trigger: TriggerDefinition = {
      type: 'schedule',
      cron_expression: cronExpression,
    };

    this._workflow.triggers.push(trigger);
    return this;
  }

  onInterval(interval: string): WorkflowInstance {
    const cronExpression = this._intervalToCron(interval);
    return this.onSchedule(cronExpression);
  }

  onEvent(eventName: string): WorkflowInstance {
    const trigger: TriggerDefinition = {
      type: 'manual', // For now, treat events as manual triggers
    };

    this._workflow.triggers.push(trigger);
    return this;
  }

  manual(): WorkflowInstance {
    const trigger: TriggerDefinition = {
      type: 'manual',
    };

    this._workflow.triggers.push(trigger);
    return this;
  }

  if(
    name: string,
    condition: (ctx: Context) => boolean | Promise<boolean>,
    options?: any
  ): WorkflowInstance {
    const conditionalStep: StepDefinition = {
      id: `conditional_${name}`,
      name: `if_${name}`,
      handler: condition,
      type: 'step',
      options: {
        ...options,
        conditional: true,
        conditionType: 'if',
      },
    };

    this._workflow.steps.push(conditionalStep);
    this._currentStep = conditionalStep;

    this._controlFlowStack.push({
      type: 'if',
      name,
      condition,
      startIndex: this._workflow.steps.length - 1,
    });

    return this;
  }

  parallel(
    steps: Array<(ctx: Context) => any | Promise<any>>
  ): WorkflowInstance {
    const parallelStep: StepDefinition = {
      id: `parallel_${generateId('parallel')}`,
      name: 'parallel_execution',
      handler: async (ctx: Context) => {
        const results = await Promise.all(steps.map(stepFn => stepFn(ctx)));
        return results;
      },
      type: 'step',
      options: {
        parallel: true,
        stepCount: steps.length,
      },
    };

    this._workflow.steps.push(parallelStep);
    this._currentStep = parallelStep;

    return this;
  }

  race(steps: Array<(ctx: Context) => any | Promise<any>>): WorkflowInstance {
    const raceStep: StepDefinition = {
      id: `race_${generateId('race')}`,
      name: 'race_execution',
      handler: async (ctx: Context) => {
        const result = await Promise.race(steps.map(stepFn => stepFn(ctx)));
        return result;
      },
      type: 'step',
      options: {
        race: true,
        stepCount: steps.length,
      },
    };

    this._workflow.steps.push(raceStep);
    this._currentStep = raceStep;

    return this;
  }

  while(
    name: string,
    condition: (ctx: Context) => boolean | Promise<boolean>,
    iterationFn: (ctx: Context) => void
  ): WorkflowInstance {
    const whileStep: StepDefinition = {
      id: `while_${name}`,
      name: `while_${name}`,
      handler: async (ctx: Context) => {
        let iterations = 0;
        const maxIterations = 1000; // Prevent infinite loops

        while ((await condition(ctx)) && iterations < maxIterations) {
          iterationFn(ctx);
          iterations++;
        }

        if (iterations >= maxIterations) {
          throw new Error(
            `While loop exceeded maximum iterations (${maxIterations})`
          );
        }

        return { iterations, completed: true };
      },
      type: 'step',
      options: {
        loop: true,
        maxIterations: 1000,
      },
    };

    this._workflow.steps.push(whileStep);
    this._currentStep = whileStep;

    return this;
  }

  endIf(): WorkflowInstance {
    if (this._controlFlowStack.length === 0) {
      throw new Error('endIf() called without matching if()');
    }

    const lastControlFlow =
      this._controlFlowStack[this._controlFlowStack.length - 1];
    if (
      lastControlFlow.type !== 'if' &&
      lastControlFlow.type !== 'elseIf' &&
      lastControlFlow.type !== 'else'
    ) {
      throw new Error('endIf() called without matching if()');
    }

    const endIfStep: StepDefinition = {
      id: `endif_${lastControlFlow.name}`,
      name: `endif_${lastControlFlow.name}`,
      handler: (ctx: Context) => {
        return { type: 'endIf', blockName: lastControlFlow.name };
      },
      type: 'step',
      options: {
        controlFlow: true,
        endIf: true,
      },
    };

    this._workflow.steps.push(endIfStep);
    this._currentStep = endIfStep;

    this._controlFlowStack.pop();

    return this;
  }

  elseIf(
    name: string,
    condition: (ctx: Context) => boolean | Promise<boolean>
  ): WorkflowInstance {
    if (this._controlFlowStack.length === 0) {
      throw new Error('elseIf() called without matching if()');
    }

    const lastControlFlow =
      this._controlFlowStack[this._controlFlowStack.length - 1];
    if (lastControlFlow.type !== 'if' && lastControlFlow.type !== 'elseIf') {
      throw new Error('elseIf() called without matching if()');
    }

    const elseIfStep: StepDefinition = {
      id: `elseif_${name}`,
      name: `elseif_${name}`,
      handler: condition,
      type: 'step',
      options: {
        conditional: true,
        conditionType: 'elseIf',
      },
    };

    this._workflow.steps.push(elseIfStep);
    this._currentStep = elseIfStep;

    this._controlFlowStack.push({
      type: 'elseIf',
      name,
      condition,
      startIndex: this._workflow.steps.length - 1,
    });

    return this;
  }

  else(): WorkflowInstance {
    if (this._controlFlowStack.length === 0) {
      throw new Error('else() called without matching if()');
    }

    const lastControlFlow =
      this._controlFlowStack[this._controlFlowStack.length - 1];
    if (lastControlFlow.type !== 'if' && lastControlFlow.type !== 'elseIf') {
      throw new Error('else() called without matching if()');
    }

    const elseStep: StepDefinition = {
      id: `else_${lastControlFlow.name}`,
      name: `else_${lastControlFlow.name}`,
      handler: (ctx: Context) => {
        return true;
      },
      type: 'step',
      options: {
        conditional: true,
        conditionType: 'else',
      },
    };

    this._workflow.steps.push(elseStep);
    this._currentStep = elseStep;

    this._controlFlowStack.push({
      type: 'else',
      name: lastControlFlow.name,
      startIndex: this._workflow.steps.length - 1,
    });

    return this;
  }

  cancel(reason?: string): WorkflowInstance {
    const cancelStep: StepDefinition = {
      id: `cancel_${generateId('cancel')}`,
      name: 'cancel_workflow',
      handler: (ctx: Context) => {
        throw new Error(
          `Workflow cancelled: ${reason || 'No reason provided'}`
        );
      },
      type: 'step',
      options: {
        cancel: true,
        reason,
      },
    };

    this._workflow.steps.push(cancelStep);
    this._currentStep = cancelStep;

    return this;
  }

  sleep(duration: string | number): WorkflowInstance {
    return this.action('sleep', async ctx => {
      const ms =
        typeof duration === 'string' ? parseDuration(duration) : duration;
      await new Promise(resolve => setTimeout(resolve, ms));
    });
  }

  subflow(name: string, workflowId: string, input?: any): WorkflowInstance {
    const subflowStep: StepDefinition = {
      id: `subflow_${name}`,
      name: `subflow_${name}`,
      handler: async (ctx: Context) => {
        // TODO: Implement actual subflow execution
        // For now, simulate subflow execution
        console.log(`Executing subflow: ${workflowId} with input:`, input);

        // Simulate subflow result
        return {
          subflowId: workflowId,
          input,
          result: { status: 'completed', subflowName: name },
        };
      },
      type: 'step',
      options: {
        subflow: true,
        workflowId,
        input,
      },
    };

    this._workflow.steps.push(subflowStep);
    this._currentStep = subflowStep;

    return this;
  }

  forEach(
    name: string,
    items: (ctx: Context) => any[] | Promise<any[]>,
    iterationFn: (item: any, flow: WorkflowInstance) => void
  ): WorkflowInstance {
    const forEachStep: StepDefinition = {
      id: `forEach_${name}`,
      name: `forEach_${name}`,
      handler: async (ctx: Context) => {
        const itemsArray = await items(ctx);

        if (!Array.isArray(itemsArray)) {
          throw new Error('forEach items function must return an array');
        }

        const results = await Promise.all(
          itemsArray.map(async (item, index) => {
            const tempFlow = new WorkflowInstance(
              {
                id: `${this._workflow.id}_${name}_${index}`,
                name: `${name}_iteration_${index}`,
                steps: [],
                triggers: [],
                created_at: new Date(),
                updated_at: new Date(),
              },
              this._cronflowInstance
            );

            iterationFn(item, tempFlow);

            const iterationSteps = tempFlow.getSteps();

            let result = null;
            for (const step of iterationSteps) {
              if (step.handler) {
                result = await step.handler(ctx);
              }
            }

            return {
              item,
              result,
              index,
            };
          })
        );

        return {
          type: 'forEach',
          name,
          results,
          totalItems: itemsArray.length,
        };
      },
      type: 'step',
      options: {
        forEach: true,
        parallel: true,
      },
    };

    this._workflow.steps.push(forEachStep);
    this._currentStep = forEachStep;

    return this;
  }

  batch(
    name: string,
    options: { items: (ctx: Context) => any[] | Promise<any[]>; size: number },
    batchFn: (batch: any[], flow: WorkflowInstance) => void
  ): WorkflowInstance {
    const batchStep: StepDefinition = {
      id: `batch_${name}`,
      name: `batch_${name}`,
      handler: async (ctx: Context) => {
        const itemsArray = await options.items(ctx);

        if (!Array.isArray(itemsArray)) {
          throw new Error('batch items function must return an array');
        }

        const { size } = options;
        const batches = [];

        for (let i = 0; i < itemsArray.length; i += size) {
          batches.push(itemsArray.slice(i, i + size));
        }

        const results = [];

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];

          const tempFlow = new WorkflowInstance(
            {
              id: `${this._workflow.id}_${name}_batch_${batchIndex}`,
              name: `${name}_batch_${batchIndex}`,
              steps: [],
              triggers: [],
              created_at: new Date(),
              updated_at: new Date(),
            },
            this._cronflowInstance
          );

          batchFn(batch, tempFlow);

          const batchSteps = tempFlow.getSteps();

          let batchResult = null;
          for (const step of batchSteps) {
            if (step.handler) {
              batchResult = await step.handler(ctx);
            }
          }

          results.push({
            batchIndex,
            items: batch,
            result: batchResult,
            size: batch.length,
          });
        }

        return {
          type: 'batch',
          name,
          results,
          totalBatches: batches.length,
          totalItems: itemsArray.length,
        };
      },
      type: 'step',
      options: {
        batch: true,
        batchSize: options.size,
      },
    };

    this._workflow.steps.push(batchStep);
    this._currentStep = batchStep;

    return this;
  }

  humanInTheLoop(options: {
    timeout: string;
    onPause: (token: string) => void;
    description: string;
    approvalUrl?: string;
    metadata?: Record<string, any>;
  }): WorkflowInstance {
    const token = generateId('human_approval');
    const timeoutMs = parseDuration(options.timeout);
    const createdAt = Date.now();
    const expiresAt = createdAt + timeoutMs;

    const humanStep: StepDefinition = {
      id: `human_${token}`,
      name: 'human_in_the_loop',
      handler: async (ctx: Context) => {
        // Call the onPause function with the token
        options.onPause(token);

        const pauseInfo = {
          token,
          workflowId: ctx.run.workflowId,
          runId: ctx.run.id,
          stepId: `human_${token}`,
          description: options.description,
          metadata: options.metadata || {},
          createdAt,
          expiresAt,
          status: 'waiting',
          payload: ctx.payload,
          lastStepOutput: ctx.last,
        };

        // TODO: Store pause info in persistent storage (database)
        console.log(`🛑 Human approval required: ${options.description}`);
        console.log(`🔑 Approval token: ${token}`);
        console.log(
          `⏰ Timeout: ${options.timeout} (expires at ${new Date(expiresAt).toISOString()})`
        );

        if (options.approvalUrl) {
          console.log(`🌐 Approval URL: ${options.approvalUrl}?token=${token}`);
        }

        // Simulate approval after a short delay for demo purposes
        // In real implementation, this would wait for external resume call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Simulate approval response
        const approvalResponse = {
          approved: true,
          reason: 'Demo approval',
          approvedBy: 'demo-user',
          approvedAt: Date.now(),
        };

        return {
          type: 'human_approval',
          token,
          description: options.description,
          metadata: options.metadata,
          approved: approvalResponse.approved,
          reason: approvalResponse.reason,
          approvedBy: approvalResponse.approvedBy,
          approvedAt: approvalResponse.approvedAt,
          expiresAt,
          status: 'completed',
        };
      },
      type: 'step',
      options: {
        humanInTheLoop: true,
        token,
        timeout: timeoutMs,
        description: options.description,
        approvalUrl: options.approvalUrl,
        metadata: options.metadata,
        createdAt,
        expiresAt,
      },
    };

    this._workflow.steps.push(humanStep);
    this._currentStep = humanStep;

    return this;
  }

  waitForEvent(eventName: string, timeout?: string): WorkflowInstance {
    const timeoutMs = timeout ? parseDuration(timeout) : undefined;

    const waitStep: StepDefinition = {
      id: `wait_${eventName}`,
      name: `wait_for_event_${eventName}`,
      handler: async (ctx: Context) => {
        // TODO: Implement actual event waiting mechanism
        console.log(`Waiting for event: ${eventName}`);
        if (timeout) {
          console.log(`Timeout: ${timeout}`);
        }

        // Simulate event reception
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
          type: 'event_wait',
          eventName,
          received: true, // Simulated event
          data: { event: eventName, timestamp: Date.now() },
        };
      },
      type: 'step',
      options: {
        waitForEvent: true,
        eventName,
        timeout: timeoutMs,
      },
    };

    this._workflow.steps.push(waitStep);
    this._currentStep = waitStep;

    return this;
  }

  onError(handlerFn: (ctx: Context) => any): WorkflowInstance {
    if (!this._currentStep) {
      throw new Error('No current step. Call .step() or .action() first.');
    }

    if (!this._currentStep.options) {
      this._currentStep.options = {};
    }

    this._currentStep.options.onError = handlerFn;
    return this;
  }

  log(
    message: string | ((ctx: Context) => string),
    level?: 'info' | 'warn' | 'error'
  ): WorkflowInstance {
    return this.action('log', ctx => {
      const msg = typeof message === 'function' ? message(ctx) : message;
      console.log(`[${level || 'info'}] ${msg}`);
    });
  }

  validate(): void {
    validateWorkflow(this._workflow);
  }

  toJSON(): string {
    this.validate();
    return JSON.stringify(this._workflow, null, 2);
  }

  getDefinition(): WorkflowDefinition {
    return { ...this._workflow };
  }

  getId(): string {
    return this._workflow.id;
  }

  getName(): string {
    return this._workflow.name || this._workflow.id;
  }

  getSteps(): StepDefinition[] {
    return [...this._workflow.steps];
  }

  getTriggers(): TriggerDefinition[] {
    return [...this._workflow.triggers];
  }

  hasWebhookTriggers(): boolean {
    return this._workflow.triggers.some(t => t.type === 'webhook');
  }

  hasScheduleTriggers(): boolean {
    return this._workflow.triggers.some(t => t.type === 'schedule');
  }

  hasManualTriggers(): boolean {
    return this._workflow.triggers.some(t => t.type === 'manual');
  }

  getStep(id: string): StepDefinition | undefined {
    return this._workflow.steps.find(step => step.id === id);
  }

  async register(): Promise<void> {
    this.validate();

    // Register with the Cronflow instance (which will handle Rust engine registration)
    if (
      this._cronflowInstance &&
      typeof this._cronflowInstance.registerWorkflow === 'function'
    ) {
      await this._cronflowInstance.registerWorkflow(this._workflow);
    } else {
      console.log(`Registering workflow: ${this._workflow.id}`);
    }

    return Promise.resolve();
  }

  private _intervalToCron(interval: string): string {
    const match = interval.match(/^(\d+)([mhd])$/);
    if (!match) {
      throw new Error(
        `Invalid interval format: ${interval}. Expected format like "5m", "1h", "1d"`
      );
    }

    const [, amount, unit] = match;
    const num = parseInt(amount);

    switch (unit) {
      case 'm': // minutes
        return `*/${num} * * * *`;
      case 'h': // hours
        return `0 */${num} * * *`;
      case 'd': // days
        return `0 0 */${num} * *`;
      default:
        throw new Error(`Unsupported interval unit: ${unit}`);
    }
  }
}

export function createWorkflow(
  options: Omit<
    WorkflowDefinition,
    'steps' | 'triggers' | 'created_at' | 'updated_at'
  >,
  cronflowInstance: any
): WorkflowInstance {
  const workflow: WorkflowDefinition = {
    ...options,
    steps: [],
    triggers: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  return new WorkflowInstance(workflow, cronflowInstance);
}
