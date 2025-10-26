/**
 * @file debit-account.handler.ts
 * @description This file contains the activity handler for the 'DebitAccount' step
 * in a financial transaction saga. It is responsible for dispatching a command
 * to the accounts-service to perform the debit operation.
 *
 * @see /docs/adr/ADR-001-saga-orchestration-pattern.md
 * @see /docs/adr/ADR-002-abstracted-event-bus.md
 * @version 1.0.0
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

// import { EventingService } from '@libs/eventing'; // Assuming the new eventing library path
// import { TransientInfrastructureError } from '@libs/error-framework'; // Assuming shared error framework
// import { IActivityHandler } from '../activity.interfaces'; // Assuming a generic interface for handlers

// --- Placeholder imports for dependencies that will exist in the new architecture ---
// The actual paths will be resolved based on the monorepo structure.

/**
 * @class EventingService
 * @description Placeholder for the abstracted event bus service.
 * @ignore
 */
class EventingService {
  /**
   * @param topic The topic to publish to.
   * @param command The command to publish.
   * @returns {Promise<void>}
   */
  async publish(topic: string, command: any): Promise<void> {
    // In a real implementation, this would publish to Kafka/etc.
    console.log(`[EventingService] Publishing to ${topic}:`, command);
    return Promise.resolve();
  }
}

/**
 * @class TransientInfrastructureError
 * @description Placeholder for a custom error from the shared error framework.
 * @ignore
 */
class TransientInfrastructureError extends Error {
  /**
   * @constructor
   * @param message The error message.
   * @param context Additional context.
   */
  constructor(message: string, context?: { cause?: Error; context?: any }) {
    super(message);
    this.name = 'TransientInfrastructureError';
    if (context?.cause) {
      this.stack = context.cause.stack;
    }
  }
}

/**
 * @interface IActivityHandler
 * @description Placeholder for the generic activity handler interface.
 * @ignore
 */
interface IActivityHandler<TPayload, TResult> {
  /**
   * @param payload The activity payload.
   * @param context The saga context.
   * @returns {Promise<TResult>}
   */
  execute(payload: TPayload, context: { sagaId: string; correlationId: string }): Promise<TResult>;
}
// --- End of placeholder imports ---

/**
 * @interface DebitAccountActivityPayload
 * @description Defines the expected input payload for the DebitAccountHandler.
 * This interface would be generated from a central schema (e.g., Avro, Protobuf).
 */
export interface DebitAccountActivityPayload {
  /**
   * The unique identifier of the account to be debited.
   * @type {string}
   * @format uuid
   */
  readonly accountId: string;

  /**
   * The amount to debit from the account.
   * @type {number}
   */
  readonly amount: number;

  /**
   * The ISO 4217 currency code of the amount.
   * @type {string}
   * @example "USD"
   */
  readonly currency: string;

  /**
   * A unique identifier for this specific transaction attempt within the saga.
   * This is used for idempotency in the downstream service.
   * @type {string}
   * @format uuid
   */
  readonly transactionId: string;
}

/**
 * @interface DebitAccountActivityResult
 * @description Defines the expected output/result from a successful DebitAccountHandler execution.
 * The saga orchestrator uses this result to pass data to subsequent steps.
 */
export interface DebitAccountActivityResult {
  /**
   * The reference ID for the dispatched debit command. This can be used for correlation
   * with the completion event from the accounts-service.
   * @type {string}
   * @format uuid
   */
  readonly debitTransactionRef: string;
}

/**
 * @class DebitAccountHandler
 * @implements {IActivityHandler<DebitAccountActivityPayload, DebitAccountActivityResult>}
 * @description Handles the 'Debit Account' activity in a saga. It communicates with the
 * 'accounts-service' by publishing a `DebitAccountCommand` to the event bus. This decouples
 * the orchestrator from the direct implementation details of the accounts service.
 */
@Injectable()
export class DebitAccountHandler implements IActivityHandler<DebitAccountActivityPayload, DebitAccountActivityResult> {
  private readonly logger = new Logger(DebitAccountHandler.name);
  private readonly commandTopic = 'accounts.commands';
  private readonly commandType = 'DebitAccountCommand';

  /**
   * @constructor
   * @param {EventingService} eventingService - The abstracted event bus service for publishing commands.
   */
  constructor(private readonly eventingService: EventingService) {}

  /**
   * Executes the debit account activity by dispatching a command to the event bus.
   *
   * @public
   * @async
   * @param {DebitAccountActivityPayload} payload - The data required to perform the debit.
   * @param {object} context - The saga execution context, containing correlation IDs.
   * @param {string} context.sagaId - The unique ID of the parent saga instance.
   * @param {string} context.correlationId - The correlation ID for tracing the entire business transaction.
   * @returns {Promise<DebitAccountActivityResult>} A promise that resolves with a reference to the dispatched command.
   * @throws {TransientInfrastructureError} If the command cannot be published to the event bus, indicating a retryable error.
   * @example
   * const handler = new DebitAccountHandler(new EventingService());
   * const result = await handler.execute(
   *   {
   *     accountId: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
   *     amount: 100.50,
   *     currency: 'USD',
   *     transactionId: 'f0e9d8c7-b6a5-4f3e-2d1c-0b9a8e7d6c5b'
   *   },
   *   {
   *     sagaId: 's1g2h3j4-k5l6-7890-1234-567890mnopqr',
   *     correlationId: 'c1o2r3r4-e5l6-7890-1234-567890stuvwx'
   *   }
   * );
   * console.log(result.debitTransactionRef); // 'f0e9d8c7-b6a5-4f3e-2d1c-0b9a8e7d6c5b'
   */
  public async execute(
    payload: DebitAccountActivityPayload,
    context: { sagaId: string; correlationId: string },
  ): Promise<DebitAccountActivityResult> {
    this.logger.log(
      `Executing DebitAccount activity for saga ${context.sagaId}. Account: ${payload.accountId}, Amount: ${payload.amount} ${payload.currency}`,
    );

    const command = {
      id: uuidv4(),
      type: this.commandType,
      payload: {
        accountId: payload.accountId,
        amount: payload.amount,
        currency: payload.currency,
        transactionId: payload.transactionId,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: context.correlationId,
        causationId: context.sagaId,
        service: 'saga-orchestrator-service',
      },
    };

    try {
      await this.eventingService.publish(this.commandTopic, command);

      this.logger.log(
        `Successfully published ${this.commandType} (ID: ${command.id}) to topic '${this.commandTopic}'.`,
      );

      // The handler's responsibility is to dispatch the command.
      // The saga orchestrator will listen for a completion or failure event from the accounts-service.
      // We return the transactionId as a reference for correlation.
      return {
        debitTransactionRef: payload.transactionId,
      };
    } catch (error) {
      this.logger.error(
        `Failed to publish ${this.commandType} for saga ${context.sagaId}. Error: ${error.message}`,
        error.stack,
      );

      // As per the Universal Error Handling Framework directive, throw a specific, typed error.
      // This allows the saga orchestrator to implement robust error handling (e.g., retries for transient errors).
      throw new TransientInfrastructureError(
        'Failed to publish DebitAccountCommand to the event bus.',
        {
          cause: error,
          context: {
            topic: this.commandTopic,
            sagaId: context.sagaId,
            payload,
          },
        },
      );
    }
  }
}
