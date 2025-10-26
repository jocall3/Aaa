/**
 * @file This file contains the activity handler for issuing rewards as part of a distributed transaction saga.
 * @author Elite AI Implementation Team
 * @version 1.0.0
 * @description Implements the 'IssueRewards' step of the payment saga. It is responsible for
 * dispatching a command to the rewards-service to issue loyalty points for a completed payment.
 * It also defines the compensating action to revoke those points if the saga fails later.
 */

import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { IActivity } from '../../interfaces/activity.interface';
import { PaymentSagaContext } from '../payment-saga.context';
// The following are conceptual imports based on the new architecture.
// import { EventingPort } from '../../../../libs/eventing/src/eventing.port';
// import { ValidationError, InfrastructureError } from '../../../../libs/error-framework/src';
// import { RewardsCommands } from '../../../../libs/contracts/src/rewards.contracts';

// --- Placeholder imports for a self-contained example ---
// In a real monorepo, these would be imported from shared libraries as shown above.

/**
 * @conceptual
 * @interface EventingPort
 * @description Placeholder for the abstract Event Bus Port.
 */
interface EventingPort {
  publish(topic: string, message: any): Promise<void>;
}

/**
 * @conceptual
 * @namespace RewardsCommands
 * @description Placeholder for centralized reward command schemas.
 */
namespace RewardsCommands {
  export interface IssueRewards { metadata: { commandName: string; correlationId: string; }; data: { rewardsTransactionId: string; customerId: string; sourcePaymentId: string; amount: number; currency: string; reason: string; }; }
  export interface RevokeRewards { metadata: { commandName: string; correlationId: string; }; data: { originalPaymentId: string; originalRewardsTransactionId?: string; reason: string; }; }
}

class ValidationError extends Error { constructor(message: string, details?: any) { super(message); this.name = 'ValidationError'; } }
class InfrastructureError extends Error { constructor(message: string, details?: any) { super(message); this.name = 'InfrastructureError'; } }

// --------------------------------------------------------

/**
 * @interface IssueRewardsResult
 * @description The output of a successful IssueRewards activity execution.
 * It contains the ID of the rewards transaction for tracing purposes.
 */
export interface IssueRewardsResult {
  /**
   * The unique identifier for the rewards transaction that was issued.
   * This is used to correlate the saga step with the action in the rewards-service.
   * @type {string}
   */
  rewardsTransactionId: string;
}

/**
 * @class IssueRewardsHandler
 * @implements {IActivity<PaymentSagaContext, IssueRewardsResult>}
 * @description Handles the 'IssueRewards' task in the payment saga.
 *
 * @summary
 * This handler is responsible for two main functions:
 * 1. `execute`: Publishes an `IssueRewardsCommand` to the event bus. This command instructs the
 *    `rewards-service` to calculate and credit loyalty points to a customer's account based on a
 *    successful payment.
 * 2. `compensate`: Publishes a `RevokeRewardsCommand` to the event bus. This is the compensating
 *    transaction that gets triggered by the saga orchestrator if a subsequent step in the saga fails.
 *    It instructs the `rewards-service` to reverse the previously awarded points.
 *
 * @example
 * ```typescript
 * // Instantiated and invoked by the saga orchestrator engine
 * const issueRewardsHandler = new IssueRewardsHandler(eventingAdapter);
 * const result = await issueRewardsHandler.execute(sagaContext);
 * // or, in case of failure:
 * await issueRewardsHandler.compensate(sagaContext);
 * ```
 * @see {@link PaymentSagaContext} for the data passed between saga steps.
 * @see {@link EventingPort} for the event publishing interface.
 * @see {@link RewardsCommands} for command schemas.
 */
export class IssueRewardsHandler implements IActivity<PaymentSagaContext, IssueRewardsResult> {
  private readonly logger = new Logger(IssueRewardsHandler.name);
  public readonly activityName = 'IssueRewards';

  /**
   * @constructor
   * @param {EventingPort} eventBus - An adapter for the eventing platform, used to publish commands.
   * This dependency is injected, adhering to the Hexagonal Architecture.
   */
  constructor(private readonly eventBus: EventingPort) {}

  /**
   * Executes the primary logic of the activity: issuing rewards.
   *
   * @param {PaymentSagaContext} context - The current context of the saga execution, containing
   * data from previous steps (e.g., customerId, payment amount).
   * @returns {Promise<IssueRewardsResult>} A promise that resolves with the result of the activity,
   * which includes the rewards transaction ID.
   * @throws {ValidationError} If the required data (customerId, paymentId, amount) is missing from the context.
   * @throws {InfrastructureError} If publishing the command to the event bus fails.
   */
  public async execute(context: PaymentSagaContext): Promise<IssueRewardsResult> {
    this.logger.log(`Executing '${this.activityName}' for saga instance ${context.sagaId}...`);

    const { customerId, paymentId, transactionAmount, transactionCurrency, sagaId } = context.data;

    if (!customerId || !paymentId || !transactionAmount || !transactionCurrency) {
      throw new ValidationError(
        `Invalid context for '${this.activityName}'. Missing required fields.`,
        { context },
      );
    }
    
    const rewardsTransactionId = uuidv4();

    const command: RewardsCommands.IssueRewards = {
      metadata: {
        commandName: 'IssueRewards',
        correlationId: sagaId,
      },
      data: {
        rewardsTransactionId,
        customerId,
        sourcePaymentId: paymentId,
        amount: transactionAmount,
        currency: transactionCurrency,
        reason: `Rewards for payment ${paymentId}`,
      },
    };

    try {
      await this.eventBus.publish('rewards.commands.issue', command);
      this.logger.log(
        `Successfully published '${command.metadata.commandName}' for payment ${paymentId} with rewardsTransactionId ${rewardsTransactionId}.`,
      );

      // We return the generated ID so the orchestrator can store it in the context
      // for potential use in later compensation logic if needed.
      return { rewardsTransactionId };

    } catch (error) {
      this.logger.error(`Failed to publish '${command.metadata.commandName}' for saga ${sagaId}.`, error);
      throw new InfrastructureError(`Failed to publish '${this.activityName}' command.`, { cause: error });
    }
  }

  /**
   * Executes the compensating logic for the activity: revoking rewards.
   *
   * @param {PaymentSagaContext} context - The context of the saga execution. This context should
   * contain the original `paymentId` to identify which rewards to revoke.
   * @returns {Promise<void>} A promise that resolves when the compensating command has been published.
   * @throws {ValidationError} If the required data (paymentId) is missing from the context.
   * @throws {InfrastructureError} If publishing the command to the event bus fails.
   */
  public async compensate(context: PaymentSagaContext): Promise<void> {
    this.logger.warn(`Compensating '${this.activityName}' for saga instance ${context.sagaId}...`);
    
    const { paymentId, sagaId } = context.data;
    const { rewardsTransactionId } = context.results.IssueRewards || {}; // Get result from execute step

    if (!paymentId) {
      throw new ValidationError(
        `Invalid context for compensating '${this.activityName}'. Missing 'paymentId'.`,
        { context },
      );
    }

    const command: RewardsCommands.RevokeRewards = {
      metadata: {
        commandName: 'RevokeRewards',
        correlationId: sagaId,
      },
      data: {
        originalPaymentId: paymentId,
        // If we have the specific rewards transaction ID, we can use it for more precise compensation.
        originalRewardsTransactionId: rewardsTransactionId, 
        reason: `Saga compensation for failed transaction related to payment ${paymentId}.`,
      },
    };

    try {
      await this.eventBus.publish('rewards.commands.revoke', command);
      this.logger.log(`Successfully published '${command.metadata.commandName}' for original payment ${paymentId}.`);
    } catch (error) {
      this.logger.error(`Failed to publish compensation command '${command.metadata.commandName}' for saga ${sagaId}.`, error);
      // A failure here is critical. The saga may need to enter a manual recovery state.
      throw new InfrastructureError(`Failed to publish '${this.activityName}' compensation command.`, { cause: error });
    }
  }
}
