/**
 * @file This file defines the `AccountCreatedEvent`, a domain event that is dispatched when a new financial account is successfully created within the system.
 * @version 1.0.0
 * @since 1.0.0
 * @see {@link ../aggregates/account.aggregate.ts} for the aggregate that produces this event.
 */

/**
 * Represents the immutable fact that a new financial account has been created.
 * As a domain event, it captures all essential properties required to constitute the
 * initial state of an `Account` aggregate root. This event is designed to be stored
 * in an event store as part of an event stream for the corresponding account, and published
 * to an event bus for consumption by other services (e.g., to create read models).
 *
 * @class AccountCreatedEvent
 */
export class AccountCreatedEvent {
  /**
   * A readonly, static property that uniquely identifies the type of this event.
   * This is used for deserialization and for routing the event to appropriate handlers.
   * @public
   * @static
   * @readonly
   * @type {string}
   */
  public static readonly eventType = 'AccountCreatedEvent';

  /**
   * Constructs an instance of the `AccountCreatedEvent`.
   * The properties are declared as public and readonly to enforce the immutability
   * of the event, a core principle in event-sourcing and domain-driven design.
   *
   * @param {string} accountId - The unique identifier (UUID) for the newly created account aggregate. This serves as the primary identifier for the aggregate root.
   * @param {string} userId - The identifier of the user who owns this account. This provides a crucial link to the User Identity domain.
   * @param {string} accountType - The classification of the account. Conforms to a controlled vocabulary within the domain (e.g., 'CHECKING', 'SAVINGS', 'CREDIT_CARD').
   * @param {string} currency - The ISO 4217 currency code for the account's balance (e.g., 'USD', 'EUR', 'GBP').
   * @param {number} initialBalance - The starting balance of the account at the moment of its creation. For credit accounts, this may be 0 or a negative value representing an initial debt.
   * @param {Date} createdAt - The precise timestamp (in UTC) indicating when the account creation occurred. This is critical for event ordering, state reconstruction, and auditing.
   */
  constructor(
    public readonly accountId: string,
    public readonly userId: string,
    public readonly accountType: string,
    public readonly currency: string,
    public readonly initialBalance: number,
    public readonly createdAt: Date,
  ) {}
}
