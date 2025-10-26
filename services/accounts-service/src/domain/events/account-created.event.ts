/**
 * @file This file defines the `AccountCreatedEvent`, a domain event that is dispatched when a new financial account is successfully created.
 * @version 2.0.0
 * @since 1.0.0
 * @see {@link ../model/account.aggregate.ts} for the aggregate that produces this event.
 * @see /docs/adr/ADR-002-event-driven-architecture.md for architectural decisions on events.
 * @see /schemas/avro/com/bank/accounts/v1/AccountCreated.avsc for the formal schema definition.
 */

/**
 * @interface AccountCreatedEventPayload
 * @description The specific data payload for an `AccountCreatedEvent`.
 * This structure is designed to be compliant with the centralized schema registry.
 * It contains the essential business data about the account creation.
 *
 * @property {string} userId The identifier of the user who owns this account.
 * @property {string} accountType The classification of the account (e.g., 'CHECKING', 'SAVINGS').
 * @property {string} currency The ISO 4217 currency code for the account's balance (e.g., 'USD').
 * @property {number} initialBalance The starting balance of the account at creation.
 */
export interface AccountCreatedEventPayload {
  readonly userId: string;
  readonly accountType: string;
  readonly currency: string;
  readonly initialBalance: number;
}

/**
 * @class AccountCreatedEvent
 * @description Represents the immutable fact that a new financial account has been created.
 * As a domain event, it captures all essential properties required to constitute the
 * initial state of an `Account` aggregate root. This event is stored in an event store
 * and published to the event bus for consumption by other services (e.g., to create read models).
 * Its structure is defined by a schema in the central registry to ensure cross-service compatibility.
 */
export class AccountCreatedEvent {
  /**
   * A readonly, static property that uniquely identifies the type and version of this event.
   * This is used for deserialization, routing, and schema validation by the universal `Eventing` library.
   *
   * @public
   * @static
   * @readonly
   * @type {string}
   * @example 'AccountCreated.v1'
   */
  public static readonly eventType = 'AccountCreated.v1';

  /**
   * The precise timestamp (in UTC) indicating when the event was instantiated.
   *
   * @public
   * @readonly
   * @type {Date}
   */
  public readonly timestamp: Date;

  /**
   * Constructs an instance of the `AccountCreatedEvent`.
   * The properties are declared as public and readonly to enforce the immutability
   * of the event, a core principle in event-sourcing and domain-driven design.
   *
   * @param {string} aggregateId - The unique identifier (UUID) for the newly created account aggregate. This serves as the primary identifier for the aggregate root's event stream.
   * @param {AccountCreatedEventPayload} payload - The specific data associated with this event, conforming to the registered schema.
   * @example
   * ```ts
   * const event = new AccountCreatedEvent(
   *   'a7b1d2e3-f4g5-h6i7-j8k9-l0m1n2o3p4q5',
   *   {
   *     userId: 'u1s2e3r4-i5d6-7890-abcd-ef1234567890',
   *     accountType: 'CHECKING',
   *     currency: 'USD',
   *     initialBalance: 100.00,
   *   }
   * );
   * ```
   */
  constructor(
    public readonly aggregateId: string,
    public readonly payload: AccountCreatedEventPayload,
  ) {
    this.timestamp = new Date();
  }
}
