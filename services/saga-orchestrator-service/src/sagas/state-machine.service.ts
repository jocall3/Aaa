import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { get, set } from 'lodash';

// In a real project, these interfaces, enums, and classes would be in separate files
// (e.g., in domain/ and ports/ directories). For this single-file generation task,
// they are defined here for self-containment and clarity.

// --- Ports (Interfaces for external communication) ---

/**
 * @docs-as-code
 * @interface IEventBus
 * @description Port for an abstracted event bus, responsible for publishing commands.
 * This abstraction decouples the orchestrator from the specific message broker technology (e.g., Kafka).
 * @see Eventing Platform Library architectural directive.
 */
export interface IEventBus {
  /**
   * Publishes a command message to the event bus.
   * @param {string} topic The topic or channel to publish to, derived from the ASL 'Resource' field.
   * @param {object} command The command payload, including correlation metadata.
   * @returns {Promise<void>}
   */
  publishCommand(topic: string, command: object): Promise<void>;
}

/**
 * @docs-as-code
 * @interface ISagaRepository
 * @description Port for persisting and retrieving the state of Saga executions. This allows
 * the orchestrator to be stateless, resuming long-running processes from persisted state.
 */
export interface ISagaRepository {
  create(execution: SagaExecution): Promise<SagaExecution>;
  update(execution: SagaExecution): Promise<SagaExecution>;
  findById(executionId: string): Promise<SagaExecution | null>;
  findByCorrelationId(correlationId: string): Promise<SagaExecution | null>;
}

// --- Domain Models & Types ---

/**
 * @docs-as-code
 * @enum {string} SagaStatus
 * @description Represents the possible lifecycle states of a Saga execution.
 */
export enum SagaStatus {
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  TIMED_OUT = 'TIMED_OUT',
  ABORTED = 'ABORTED',
}

/**
 * @docs-as-code
 * @class SagaExecution
 * @description Represents the state of a single, long-running Saga execution. This entity is persisted
 * by the `ISagaRepository` to maintain state across service restarts and long waits.
 */
export class SagaExecution {
  executionId: string;
  sagaName: string;
  status: SagaStatus;
  context: object;
  currentState: string;
  correlationId?: string;
  history: { state: string; timestamp: string; context: object }[];
  createdAt: Date;
  updatedAt: Date;
}

// --- Amazon States Language (ASL) Types ---

/** @see https://states-language.net/spec.html */
export interface AslDefinition {
  Comment?: string;
  StartAt: string;
  States: { [key: string]: AslState };
}

export type AslState = AslTaskState | AslChoiceState | AslSucceedState | AslFailState;

interface AslStateBase {
  Type: 'Task' | 'Choice' | 'Succeed' | 'Fail';
  Comment?: string;
  InputPath?: string;
  OutputPath?: string;
}

export interface AslTaskState extends AslStateBase {
  Type: 'Task';
  Resource: string; // The command topic to publish to
  Parameters?: object;
  ResultPath?: string;
  Next?: string;
  End?: boolean;
  Catch?: AslCatcher[];
}

export interface AslChoiceState extends AslStateBase {
  Type: 'Choice';
  Choices: AslChoiceRule[];
  Default?: string;
}

export interface AslChoiceRule {
  Variable: string;
  StringEquals?: string;
  NumericEquals?: number;
  Next: string;
}

export interface AslSucceedState extends AslStateBase {
  Type: 'Succeed';
}

export interface AslFailState extends AslStateBase {
  Type: 'Fail';
  Error?: string;
  Cause?: string;
}

export interface AslCatcher {
  ErrorEquals: string[];
  Next: string;
  ResultPath?: string;
}

/**
 * @class StateMachineService
 * @description Service responsible for loading, interpreting, and executing
 * Saga state machines defined in Amazon States Language (ASL).
 * This service is the core of the Saga Orchestrator.
 */
@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);
  private readonly definitions = new Map<string, AslDefinition>();

  /**
   * @constructor
   * @param {IEventBus} eventBus Port to the event bus for dispatching commands.
   * @param {ISagaRepository} sagaRepository Port for persisting Saga execution state.
   */
  constructor(
    @Inject('IEventBus') private readonly eventBus: IEventBus,
    @Inject('ISagaRepository') private readonly sagaRepository: ISagaRepository,
  ) {
    this.loadSagaDefinitions();
  }

  /**
   * Loads all Saga definitions into memory from a central location.
   * @private
   */
  private loadSagaDefinitions(): void {
    const paymentSaga: AslDefinition = {
      Comment: 'A Saga for processing a payment involving multiple services.',
      StartAt: 'DebitSourceAccount',
      States: {
        DebitSourceAccount: {
          Type: 'Task',
          Resource: 'commands.accounts.debit',
          Parameters: {
            'accountId.$': '$.sourceAccountId',
            'amount.$': '$.amount',
            'transactionId.$': '$.transactionId',
          },
          ResultPath: '$.debitResult',
          Next: 'CreditDestinationAccount',
          Catch: [
            {
              ErrorEquals: ['InsufficientFundsError', 'AccountNotFoundError'],
              Next: 'FailPayment',
            },
          ],
        },
        CreditDestinationAccount: {
          Type: 'Task',
          Resource: 'commands.accounts.credit',
          Parameters: {
            'accountId.$': '$.destinationAccountId',
            'amount.$': '$.amount',
            'transactionId.$': '$.transactionId',
          },
          ResultPath: '$.creditResult',
          Next: 'GrantRewardsPoints',
          Catch: [
            {
              ErrorEquals: ['AccountNotFoundError'],
              Next: 'RefundSourceAccount', // Compensating transaction
            },
          ],
        },
        GrantRewardsPoints: {
          Type: 'Task',
          Resource: 'commands.rewards.grant',
          Parameters: {
            'customerId.$': '$.customerId',
            'points.$': '$.rewardsPoints',
            'transactionId.$': '$.transactionId',
          },
          ResultPath: '$.rewardsResult',
          Next: 'SucceedPayment',
          Catch: [
            {
              ErrorEquals: ['RewardsAccountNotFoundError'],
              Next: 'SucceedPayment', // Non-critical failure, continue
            },
          ],
        },
        RefundSourceAccount: {
          Type: 'Task',
          Resource: 'commands.accounts.credit', // Compensation
          Parameters: {
            'accountId.$': '$.sourceAccountId',
            'amount.$': '$.amount',
            'transactionId.$': '$.transactionId',
            reason: 'COMPENSATION_FOR_FAILED_TRANSFER',
          },
          Next: 'FailPayment',
        },
        SucceedPayment: {
          Type: 'Succeed',
        },
        FailPayment: {
          Type: 'Fail',
          Cause: 'Payment processing failed due to business rule violation or resource unavailability.',
          Error: 'PaymentFailed',
        },
      },
    };
    this.definitions.set('PaymentSaga', paymentSaga);
    this.logger.log(`Loaded ${this.definitions.size} Saga definitions.`);
  }

  /**
   * Starts a new execution of a named Saga.
   * @param {string} sagaName - The name of the Saga definition to execute.
   * @param {object} input - The initial input data for the Saga.
   * @returns {Promise<string>} The unique execution ID of the new Saga instance.
   * @throws {NotFoundException} If the Saga definition doesn't exist.
   */
  async startExecution(sagaName: string, input: object): Promise<string> {
    const definition = this.definitions.get(sagaName);
    if (!definition) {
      throw new NotFoundException(`Saga definition '${sagaName}' not found.`);
    }

    const execution = new SagaExecution();
    execution.executionId = uuidv4();
    execution.sagaName = sagaName;
    execution.status = SagaStatus.RUNNING;
    execution.context = input;
    execution.currentState = definition.StartAt;
    execution.history = [];
    execution.createdAt = new Date();

    await this.sagaRepository.create(execution);
    this.logger.log(
      `[${execution.executionId}] Starting Saga '${sagaName}' at state '${execution.currentState}'.`,
    );

    // Asynchronously start the first step without blocking the caller
    this.step(execution.executionId).catch(err => {
      this.logger.error(
        `[${execution.executionId}] Unhandled step error: ${err.message}`,
        err.stack,
      );
      this.failExecution(
        execution.executionId,
        'UnhandledStepError',
        err.message,
      );
    });

    return execution.executionId;
  }

  /**
   * Handles a reply event from a microservice, resuming a Saga execution.
   * @param {string} correlationId - The ID linking the reply to a specific task.
   * @param {object} payload - The payload of the reply event.
   */
  async handleSagaReply(
    correlationId: string,
    payload: {
      success: boolean;
      data?: object;
      error?: string;
      cause?: string;
    },
  ): Promise<void> {
    const execution = await this.sagaRepository.findByCorrelationId(correlationId);
    if (!execution) {
      this.logger.warn(
        `Received reply for unknown or completed Saga with correlationId '${correlationId}'.`,
      );
      return;
    }

    const definition = this.definitions.get(execution.sagaName);
    const stateDef = definition.States[execution.currentState] as AslTaskState;

    if (payload.success) {
      this.logger.log(
        `[${execution.executionId}] Task '${execution.currentState}' succeeded.`,
      );
      if (stateDef.ResultPath) {
        set(execution.context, stateDef.ResultPath.substring(2), payload.data);
      }
      execution.currentState = stateDef.Next;
      execution.correlationId = null;

      if (stateDef.End || !stateDef.Next) {
        await this.succeedExecution(execution.executionId);
      } else {
        await this.sagaRepository.update(execution);
        await this.step(execution.executionId);
      }
    } else {
      this.logger.error(
        `[${execution.executionId}] Task '${execution.currentState}' failed with error: ${payload.error}.`,
      );
      const catcher = (stateDef.Catch || []).find(c =>
        c.ErrorEquals.includes(payload.error),
      );

      if (catcher) {
        this.logger.log(
          `[${execution.executionId}] Caught error '${payload.error}', transitioning to '${catcher.Next}'.`,
        );
        if (catcher.ResultPath) {
          set(execution.context, catcher.ResultPath.substring(2), {
            Error: payload.error,
            Cause: payload.cause,
          });
        }
        execution.currentState = catcher.Next;
        execution.correlationId = null;
        await this.sagaRepository.update(execution);
        await this.step(execution.executionId);
      } else {
        this.logger.error(
          `[${execution.executionId}] Unhandled error '${payload.error}'. Failing Saga.`,
        );
        await this.failExecution(
          execution.executionId,
          payload.error,
          payload.cause,
        );
      }
    }
  }

  /**
   * Executes a single state transition in the state machine.
   * @param {string} executionId - The ID of the Saga execution.
   * @private
   */
  private async step(executionId: string): Promise<void> {
    const execution = await this.sagaRepository.findById(executionId);
    if (!execution || execution.status !== SagaStatus.RUNNING) {
      this.logger.warn(
        `Step requested for non-running Saga '${executionId}'. Status: ${execution?.status}`,
      );
      return;
    }

    const definition = this.definitions.get(execution.sagaName);
    const stateName = execution.currentState;
    const stateDef = definition.States[stateName];

    if (!stateDef) {
      throw new Error(
        `State '${stateName}' not found in Saga definition '${execution.sagaName}'.`,
      );
    }

    execution.history.push({
      state: stateName,
      timestamp: new Date().toISOString(),
      context: JSON.parse(JSON.stringify(execution.context)), // Deep copy
    });
    execution.updatedAt = new Date();
    await this.sagaRepository.update(execution);

    this.logger.log(
      `[${execution.executionId}] Executing state '${stateName}' of type '${stateDef.Type}'.`,
    );

    switch (stateDef.Type) {
      case 'Task':
        await this.executeTaskState(stateDef, execution);
        break;
      case 'Succeed':
        await this.succeedExecution(executionId);
        break;
      case 'Fail':
        await this.failExecution(executionId, stateDef.Error, stateDef.Cause);
        break;
      default:
        throw new Error(`Unsupported state type '${stateDef.Type}'`);
    }
  }

  /**
   * Executes a 'Task' state by publishing a command.
   * @param {AslTaskState} state The ASL definition for the Task state.
   * @param {SagaExecution} execution The current Saga execution state.
   * @private
   */
  private async executeTaskState(
    state: AslTaskState,
    execution: SagaExecution,
  ): Promise<void> {
    const correlationId = uuidv4();

    // Basic ASL parameter substitution. A full implementation would use JSONPath.
    const commandPayload = {};
    if (state.Parameters) {
      for (const key in state.Parameters) {
        const valuePath = state.Parameters[key];
        if (typeof valuePath === 'string' && valuePath.startsWith('$.')) {
          commandPayload[key.replace('.$', '')] = get(
            execution.context,
            valuePath.substring(2),
          );
        } else {
          commandPayload[key] = valuePath;
        }
      }
    }

    const command = {
      correlationId,
      sagaExecutionId: execution.executionId,
      payload: commandPayload,
    };

    execution.correlationId = correlationId;
    await this.sagaRepository.update(execution);

    this.logger.log(
      `[${execution.executionId}] Publishing command to '${state.Resource}' with correlationId '${correlationId}'.`,
    );
    await this.eventBus.publishCommand(state.Resource, command);
  }

  /**
   * Marks a Saga execution as SUCCEEDED.
   * @param {string} executionId The ID of the Saga execution.
   * @private
   */
  private async succeedExecution(executionId: string): Promise<void> {
    const execution = await this.sagaRepository.findById(executionId);
    if (execution && execution.status === SagaStatus.RUNNING) {
      execution.status = SagaStatus.SUCCEEDED;
      execution.updatedAt = new Date();
      await this.sagaRepository.update(execution);
      this.logger.log(
        `[${execution.executionId}] Saga '${execution.sagaName}' SUCCEEDED.`,
      );
    }
  }

  /**
   * Marks a Saga execution as FAILED.
   * @param {string} executionId The ID of the Saga execution.
   * @param {string} [error] A short error code.
   * @param {string} [cause] A detailed error message.
   * @private
   */
  private async failExecution(
    executionId: string,
    error?: string,
    cause?: string,
  ): Promise<void> {
    const execution = await this.sagaRepository.findById(executionId);
    if (execution && execution.status === SagaStatus.RUNNING) {
      execution.status = SagaStatus.FAILED;
      execution.updatedAt = new Date();
      // Optionally add failure details to the context
      set(execution.context, 'errorInfo', { error, cause });
      await this.sagaRepository.update(execution);
      this.logger.error(
        `[${executionId}] Saga '${execution.sagaName}' FAILED. Error: ${error}, Cause: ${cause}`,
      );
    }
  }
}
