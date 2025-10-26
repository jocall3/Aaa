/**
 * @file credit-account.handler.ts
 * @description This file contains the activity handler for the 'CreditAccount' step in a saga.
 * It is responsible for dispatching a command to the accounts-service to credit a user's account.
 * This aligns with the Saga Orchestration and Abstracted Event Bus architectural directives.
 *
 * @see /docs/adr/ADR-001-saga-orchestration-pattern.md
 * @see /docs/adr/ADR-002-abstracted-event-bus.md
 * @module Saga/ActivityHandlers
 */

import { inject, injectable } from 'tsyringe';

import { IActivityHandler } from '../../interfaces/activity-handler.interface';
import { IEventing } from '../../../../../libs/eventing/src/eventing.interface';
import { TransientInfrastructureError } from '../../../../../libs/error-framework/src/transient-infrastructure.error';
import { ILogger } from '../../../../../libs/logger/src/logger.interface';
// Assuming command definitions are generated from a central schema registry and available in a shared package.
import { CreditAccountCommand } from '@contracts/commands/accounts';

/**
 * @interface CreditAccountInput
 * @description Defines the expected input payload for the CreditAccountHandler,
 * typically passed from a saga state machine execution step.
 *
 * @property {string} accountId The unique identifier of the account to be credited.
 * @property {number} amount The monetary amount to credit.
 * @property {string} currency The ISO 4217 currency code for the amount.
 * @property {string} transactionId A unique identifier for this specific transaction part of the saga, used for idempotency.
 * @property {string} sagaExecutionId The unique identifier of the parent saga execution, used for tracing and correlation.
 */
export interface CreditAccountInput {
  accountId: string;
  amount: number;
  currency: string;
  transactionId: string;
  sagaExecutionId: string;
}

/**
 * @interface CreditAccountOutput
 * @description Defines the output payload of the CreditAccountHandler.
 * This output is returned to the saga orchestrator upon successful execution.
 *
 * @property {boolean} commandDispatched Confirms that the command to credit the account was successfully published.
 * @property {string} dispatchedAt ISO 8601 timestamp of when the command was dispatched.
 */
export interface CreditAccountOutput {
  commandDispatched: boolean;
  dispatchedAt: string;
}

/**
 * @class CreditAccountHandler
 * @description Implements the activity handler for crediting an account as part of a distributed transaction.
 * This handler constructs a `CreditAccountCommand` and publishes it to the event bus,
 * delegating the actual account crediting logic to the `accounts-service`.
 *
 * @implements {IActivityHandler<CreditAccountInput, CreditAccountOutput>}
 */
@injectable()
export class CreditAccountHandler
  implements IActivityHandler<CreditAccountInput, CreditAccountOutput>
{
  /**
   * The Kafka topic where account-related commands are sent, as per service contract.
   * @private
   * @readonly
   */
  private readonly ACCOUNTS_COMMANDS_TOPIC = 'accounts.commands';

  /**
   * @constructor
   * @param {IEventing} eventBus - The abstracted event bus for publishing commands. This is injected, decoupling the handler from Kafka specifics.
   * @param {ILogger} logger - The structured logger for logging handler activity.
   */
  constructor(
    @inject('IEventing') private readonly eventBus: IEventing,
    @inject('ILogger') private readonly logger: ILogger,
  ) {
    this.logger.setContext('CreditAccountHandler');
  }

  /**
   * @method execute
   * @description Executes the credit account activity. It creates a `CreditAccountCommand`
   * and publishes it to the designated Kafka topic for the `accounts-service` to process.
   *
   * @param {CreditAccountInput} input The input data from the saga state machine.
   * @returns {Promise<CreditAccountOutput>} A promise that resolves with an indication that the command was dispatched.
   * @throws {TransientInfrastructureError} If publishing the command to the event bus fails after retries.
   *
   * @example
   * ```typescript
   * // Assuming 'container' is a configured DI container (e.g., tsyringe)
   * const handler = container.resolve(CreditAccountHandler);
   * try {
   *   const result = await handler.execute({
   *     accountId: 'acc-c4a7f3d4-3b1a-4e6f-9d2a-7b3c1e0a8d7f',
   *     amount: 100.50,
   *     currency: 'USD',
   *     transactionId: 'txn-f8a4b3e2-1c7d-4f9e-8b3a-9d7c6e5b4a1f',
   *     sagaExecutionId: 'saga-e2a1b4c3-8d7e-4f9a-8c3b-7d6e5b4a1f9c'
   *   });
   *   console.log('Command dispatch successful:', result);
   * } catch (error) {
   *   console.error('Failed to execute activity:', error);
   * }
   * ```
   */
  public async execute(input: CreditAccountInput): Promise<CreditAccountOutput> {
    this.logger.info(
      `Executing 'CreditAccount' activity for saga execution ID: ${input.sagaExecutionId}`,
      {
        accountId: input.accountId,
        transactionId: input.transactionId,
      },
    );

    const command: CreditAccountCommand = {
      accountId: input.accountId,
      amount: input.amount,
      currency: input.currency,
      transactionId: input.transactionId,
    };

    try {
      // The event bus library abstracts Kafka details.
      // The `publish` method handles serialization, schema validation, and publishing.
      // Using `accountId` as the key ensures commands for the same account go to the same partition,
      // which helps maintain order for account-specific operations.
      await this.eventBus.publish<CreditAccountCommand>(
        this.ACCOUNTS_COMMANDS_TOPIC,
        {
          key: command.accountId,
          value: command,
          // The eventing library is responsible for adding tracing headers.
          // We pass correlation metadata.
          headers: {
            'x-correlation-id': input.transactionId,
            'x-saga-execution-id': input.sagaExecutionId,
          },
        },
      );

      this.logger.info(
        `Successfully dispatched CreditAccountCommand for account ${input.accountId}.`,
        {
          transactionId: input.transactionId,
        },
      );

      return {
        commandDispatched: true,
        dispatchedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to dispatch CreditAccountCommand for account ${input.accountId}.`,
        {
          error,
          transactionId: input.transactionId,
          sagaExecutionId: input.sagaExecutionId,
        },
      );

      // As per the error handling directive, throw a specific, cataloged error.
      // A failure to publish to the message broker is a transient infrastructure issue.
      throw new TransientInfrastructureError(
        'Failed to publish CreditAccountCommand to the event bus.',
        {
          cause: error as Error,
          context: {
            topic: this.ACCOUNTS_COMMANDS_TOPIC,
            accountId: input.accountId,
          },
          errorCode: 'SAGA_ACTIVITY_DISPATCH_FAILURE',
        },
      );
    }
  }
}
