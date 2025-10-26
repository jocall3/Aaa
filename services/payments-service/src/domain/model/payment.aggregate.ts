import { AggregateRoot } from '../../common/domain/aggregate-root';
import { DomainEvent } from '../../common/domain/domain-event';
import { v4 as uuidv4 } from 'uuid';
import { PaymentInitiatedEvent } from '../events/payment-initiated.event';
import { PaymentCompletedEvent } from '../events/payment-completed.event';
import { PaymentFailedEvent } from '../events/payment-failed.event';
import { PaymentCancelledEvent } from '../events/payment-cancelled.event';

/**
 * @enum PaymentStatus
 * @description Represents the lifecycle of a payment transaction.
 * This enum is critical for state management within the PaymentAggregate.
 * Comprehensive TSDoc for every enum, function, class, and interface is mandatory.
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * @class PaymentAggregate
 * @extends AggregateRoot<string>
 * @description Represents a payment transaction within the domain.
 * It is the aggregate root for the Payment domain, encapsulating the state and business logic
 * for a payment. All state changes are recorded as a sequence of domain events, following the Event Sourcing pattern.
 * Comprehensive TSDoc for every function, class, and interface is mandatory.
 */
export class PaymentAggregate extends AggregateRoot<string> {
  private _sourceAccountId!: string;
  private _destinationAccountId!: string;
  private _amount!: number;
  private _currency!: string;
  private _status!: PaymentStatus;
  private _reference!: string;
  private _createdAt!: Date;
  private _updatedAt!: Date;
  private _reasonForFailure?: string;

  /**
   * @public
   * @getter
   * @description The ID of the account from which the payment is made.
   */
  public get sourceAccountId(): string { return this._sourceAccountId; }

  /**
   * @public
   * @getter
   * @description The ID of the account to which the payment is sent.
   */
  public get destinationAccountId(): string { return this._destinationAccountId; }

  /**
   * @public
   * @getter
   * @description The amount of money to be transferred.
   */
  public get amount(): number { return this._amount; }

  /**
   * @public
   * @getter
   * @description The currency of the transaction.
   */
  public get currency(): string { return this._currency; }

  /**
   * @public
   * @getter
   * @description The current status of the payment.
   */
  public get status(): PaymentStatus { return this._status; }

  /**
   * @public
   * @getter
   * @description A reference number for the payment.
   */
  public get reference(): string { return this._reference; }

  /**
   * @public
   * @getter
   * @description Timestamp of when the payment was initiated.
   */
  public get createdAt(): Date { return this._createdAt; }

  /**
   * @public
   * @getter
   * @description Timestamp of the last update to the payment state.
   */
  public get updatedAt(): Date { return this._updatedAt; }

  /**
   * @public
   * @getter
   * @description If the payment failed or was cancelled, this holds the reason.
   */
  public get reasonForFailure(): string | undefined { return this._reasonForFailure; }

  /**
   * @private
   * @constructor
   * @description Private constructor to enforce creation through factory methods, aligning with DDD principles.
   * @param {string} id - The unique identifier for the aggregate.
   */
  private constructor(id: string) {
    super(id);
  }

  /**
   * @static
   * @method initiate
   * @description Factory method to initiate a new payment. Validates inputs and creates a PaymentInitiatedEvent.
   * @param {object} params - The parameters to initiate a payment.
   * @param {string} params.sourceAccountId - The ID of the source account.
   * @param {string} params.destinationAccountId - The ID of the destination account.
   * @param {number} params.amount - The payment amount.
   * @param {string} params.currency - The payment currency.
   * @param {string} params.reference - A reference for the payment.
   * @returns {PaymentAggregate} A new instance of the PaymentAggregate with an uncommitted PaymentInitiatedEvent.
   * @throws {Error} if business rules are violated (e.g., non-positive amount).
   */
  public static initiate(params: {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    currency: string;
    reference: string;
  }): PaymentAggregate {
    if (params.amount <= 0) {
      throw new Error('Payment amount must be positive.');
    }
    if (params.sourceAccountId === params.destinationAccountId) {
      throw new Error('Source and destination accounts cannot be the same.');
    }

    const paymentId = uuidv4();
    const aggregate = new PaymentAggregate(paymentId);

    const event = new PaymentInitiatedEvent({
      aggregateId: paymentId,
      sourceAccountId: params.sourceAccountId,
      destinationAccountId: params.destinationAccountId,
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      status: PaymentStatus.PENDING,
      timestamp: new Date(),
    });

    aggregate.apply(event, true);
    return aggregate;
  }

  /**
   * @method complete
   * @description Marks the payment as completed.
   * @throws {Error} If the payment is not in a PENDING state.
   */
  public complete(): void {
    if (this._status !== PaymentStatus.PENDING) {
      throw new Error(`Cannot complete a payment that is in ${this._status} status.`);
    }

    const event = new PaymentCompletedEvent({
      aggregateId: this.id,
      timestamp: new Date(),
    });

    this.apply(event, true);
  }

  /**
   * @method fail
   * @description Marks the payment as failed with a given reason.
   * @param {string} reason - The reason for the payment failure.
   * @throws {Error} If the payment is already in a terminal state (COMPLETED, FAILED, CANCELLED).
   */
  public fail(reason: string): void {
    if ([PaymentStatus.COMPLETED, PaymentStatus.FAILED, PaymentStatus.CANCELLED].includes(this._status)) {
      throw new Error(`Cannot fail a payment that is in a terminal state: ${this._status}.`);
    }

    const event = new PaymentFailedEvent({
      aggregateId: this.id,
      reason,
      timestamp: new Date(),
    });

    this.apply(event, true);
  }

  /**
   * @method cancel
   * @description Cancels a pending payment.
   * @param {string} reason - The reason for cancellation.
   * @throws {Error} If the payment is not in a PENDING state.
   */
  public cancel(reason: string): void {
    if (this._status !== PaymentStatus.PENDING) {
      throw new Error(`Cannot cancel a payment that is not PENDING. Current status: ${this._status}.`);
    }

    const event = new PaymentCancelledEvent({
      aggregateId: this.id,
      reason,
      timestamp: new Date(),
    });

    this.apply(event, true);
  }

  /**
   * @protected
   * @method on
   * @description The dispatcher for applying events. It calls the appropriate state mutation method.
   * This is part of the Event Sourcing pattern to rebuild state from an event history.
   * @param {DomainEvent} event - The domain event to apply.
   */
  protected on(event: DomainEvent): void {
    if (event instanceof PaymentInitiatedEvent) {
      this.onPaymentInitiated(event);
    } else if (event instanceof PaymentCompletedEvent) {
      this.onPaymentCompleted(event);
    } else if (event instanceof PaymentFailedEvent) {
      this.onPaymentFailed(event);
    } else if (event instanceof PaymentCancelledEvent) {
      this.onPaymentCancelled(event);
    }
  }

  /**
   * @private
   * @method onPaymentInitiated
   * @description Applies the PaymentInitiatedEvent to mutate the aggregate's state.
   * @param {PaymentInitiatedEvent} event - The event data.
   */
  private onPaymentInitiated(event: PaymentInitiatedEvent): void {
    this._sourceAccountId = event.payload.sourceAccountId;
    this._destinationAccountId = event.payload.destinationAccountId;
    this._amount = event.payload.amount;
    this._currency = event.payload.currency;
    this._reference = event.payload.reference;
    this._status = event.payload.status;
    this._createdAt = event.timestamp;
    this._updatedAt = event.timestamp;
  }

  /**
   * @private
   * @method onPaymentCompleted
   * @description Applies the PaymentCompletedEvent to mutate the aggregate's state.
   * @param {PaymentCompletedEvent} event - The event data.
   */
  private onPaymentCompleted(event: PaymentCompletedEvent): void {
    this._status = PaymentStatus.COMPLETED;
    this._updatedAt = event.timestamp;
    this._reasonForFailure = undefined;
  }

  /**
   * @private
   * @method onPaymentFailed
   * @description Applies the PaymentFailedEvent to mutate the aggregate's state.
   * @param {PaymentFailedEvent} event - The event data.
   */
  private onPaymentFailed(event: PaymentFailedEvent): void {
    this._status = PaymentStatus.FAILED;
    this._reasonForFailure = event.payload.reason;
    this._updatedAt = event.timestamp;
  }

  /**
   * @private
   * @method onPaymentCancelled
   * @description Applies the PaymentCancelledEvent to mutate the aggregate's state.
   * @param {PaymentCancelledEvent} event - The event data.
   */
  private onPaymentCancelled(event: PaymentCancelledEvent): void {
    this._status = PaymentStatus.CANCELLED;
    this._reasonForFailure = event.payload.reason; // Re-using this field for cancellation reason
    this._updatedAt = event.timestamp;
  }
}
