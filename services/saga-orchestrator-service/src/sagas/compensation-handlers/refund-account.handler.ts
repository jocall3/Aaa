/**
 * @file refund-account.handler.ts
 * @description This file contains the compensation handler for refunding a debited account
 *              as part of a Saga rollback.
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

import { Logger } from '@nestjs/common';
import { ICompensationHandler } from '../interfaces/compensation-handler.interface';
import { IEventBus } from '../../../../libs/eventing/event-bus.port'; // Abstracted event bus
import {
  CreditAccountCommand,
  CreditReason,
} from '../../../../libs/contracts/account-commands.contract'; // Centralized command definitions
import { SagaStepContext } from '../saga-step-context';
import { ServiceTopics } from '../../../../libs/contracts/service-topics.contract'; // Centralized topic definitions

/**
 * @interface RefundAccountPayload
 * @description Defines the expected payload for the RefundAccount compensation logic.
 * This data is sourced from the initial successful 'DebitAccount' step of the saga.
 * @property {string} accountId - The ID of the account to be refunded.
 * @property {number} amount - The amount to be credited back to the account.
 * @property {string} originalTransactionId - The ID of the original debit transaction to reference in the refund.
 * @property {string} currency - The currency of the amount.
 */
export interface RefundAccountPayload {
  accountId: string;
  amount: number;
  originalTransactionId: string;
  currency: string;
}

/**
 * @class RefundAccountHandler
 * @implements {ICompensationHandler<RefundAccountPayload>}
 * @description A compensating transaction handler responsible for refunding funds to a customer's account.
 * This handler is invoked by the Saga Orchestrator when a subsequent step in a transaction fails,
 * requiring the rollback of a previously successful account debit. It achieves this by publishing a
 * `CreditAccountCommand` to the central event bus, which is consumed by the `accounts-service`.
 *
 * @example
 * // The Saga orchestrator would invoke this handler like so:
 * const context: SagaStepContext<RefundAccountPayload> = { ... };
 * const handler = new RefundAccountHandler(eventBus, new Logger());
 * await handler.execute(context);
 */
export class RefundAccountHandler
  implements ICompensationHandler<RefundAccountPayload>
{
  private readonly logger = new Logger(RefundAccountHandler.name);

  /**
   * @constructor
   * @param {IEventBus} eventBus - The injected abstract event bus for dispatching commands.
   */
  public constructor(private readonly eventBus: IEventBus) {}

  /**
   * Executes the compensation logic to refund an account.
   *
   * @public
   * @async
   * @param {SagaStepContext<RefundAccountPayload>} context - The context of the saga step that requires compensation.
   * It includes metadata like the correlation ID and the specific payload needed for this handler.
   * @returns {Promise<void>} A promise that resolves when the compensation command has been successfully published.
   * @throws {Error} Throws an error if publishing the compensation command to the event bus fails.
   */
  public async execute(
    context: SagaStepContext<RefundAccountPayload>,
  ): Promise<void> {
    const { payload, sagaCorrelationId } = context;
    const { accountId, amount, currency, originalTransactionId } = payload;

    this.logger.log(
      `[Saga Correlation ID: ${sagaCorrelationId}] Executing compensation: Refunding ${amount} ${currency} to account ${accountId}.`,
    );

    /**
     * Create a `CreditAccountCommand` to be sent to the `accounts-service`.
     * This command instructs the accounts domain to perform the refund.
     * It includes the original transaction ID for traceability and sets the reason
     * to 'SAGA_ROLLBACK' for clear auditing.
     */
    const refundCommand = new CreditAccountCommand({
      accountId,
      amount,
      currency,
      reason: CreditReason.SAGA_ROLLBACK,
      description: `Saga rollback: compensation for debit transaction ${originalTransactionId}.`,
      referenceId: originalTransactionId,
      idempotencyKey: `${sagaCorrelationId}-COMPENSATION-${originalTransactionId}`,
    });

    try {
      /**
       * Publish the command to the designated topic for account-related commands.
       * The `Eventing` library handles serialization and delivery to the message broker.
       */
      await this.eventBus.publish(ServiceTopics.AccountsCommands, refundCommand);

      this.logger.log(
        `[Saga Correlation ID: ${sagaCorrelationId}] Successfully published CreditAccountCommand for account ${accountId}.`,
      );
    } catch (error) {
      this.logger.error(
        `[Saga Correlation ID: ${sagaCorrelationId}] Failed to publish CreditAccountCommand for account ${accountId}. Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      // In a production system, a failure here is critical. The Saga is in an inconsistent state.
      // A retry mechanism with exponential backoff should be implemented in the orchestrator,
      // or the failure should be logged to a dead-letter queue/alerting system for manual intervention.
      throw new Error(
        `Compensation failed for saga ${sagaCorrelationId}: Could not publish refund command.`,
      );
    }
  }
}
