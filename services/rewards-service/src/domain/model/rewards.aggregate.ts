import { v4 as uuidv4 } from 'uuid';

// --- STUBBED CORE DOMAIN DEPENDENCIES ---
// In a real application, these would be in separate files in a core directory.

/**
 * @interface IDomainEvent
 * @description Base interface for all domain events.
 * @property {string} aggregateId - The ID of the aggregate that this event belongs to.
 * @property {string} eventType - The name of the event type.
 * @property {Date} timestamp - The time at which the event occurred.
 * @property {T} data - The payload of the event.
 */
interface IDomainEvent<T = any> {
  readonly aggregateId: string;
  readonly eventType: string;
  readonly timestamp: Date;
  readonly data: T;
}

/**
 * @abstract
 * @class AggregateRoot
 * @description Base class for all aggregate roots, handling event management and versioning.
 * It ensures that state changes are sourced from events.
 */
abstract class AggregateRoot<TState> {
  public readonly _id: string;
  private _version: number = -1;
  private readonly _uncommittedEvents: IDomainEvent[] = [];

  /**
   * @protected
   * @constructor
   * @param {string} id - The unique identifier of the aggregate root.
   */
  protected constructor(id: string) {
    this._id = id;
  }

  /**
   * @getter version
   * @description The current version of the aggregate, indicating how many events have been applied.
   * @returns {number}
   */
  public get version(): number {
    return this._version;
  }

  /**
   * @getter uncommittedEvents
   * @description A list of events that have been applied to the aggregate but not yet persisted.
   * @returns {IDomainEvent[]}
   */
  public get uncommittedEvents(): IDomainEvent[] {
    return this._uncommittedEvents;
  }

  /**
   * @method clearUncommittedEvents
   * @description Clears the list of uncommitted events. This is typically called after events have been successfully persisted.
   */
  public clearUncommittedEvents(): void {
    this._uncommittedEvents.length = 0;
  }

  /**
   * @method loadFromHistory
   * @description Rehydrates the aggregate's state by applying a sequence of historical events.
   * @param {IDomainEvent[]} history - The sequence of domain events to apply.
   */
  public loadFromHistory(history: IDomainEvent[]): void {
    history.forEach(event => {
      this.applyChange(event, false);
      this._version++;
    });
  }

  /**
   * @protected
   * @method applyChange
   * @description Applies an event to the aggregate, routing it to the appropriate handler and tracking it if it's new.
   * @param {IDomainEvent} event - The event to apply.
   * @param {boolean} [isNew=true] - Whether the event is new (and should be tracked as uncommitted) or from history.
   */
  protected applyChange(event: IDomainEvent, isNew: boolean = true): void {
    this.on(event);
    if (isNew) {
      this._uncommittedEvents.push(event);
    }
  }

  /**
   * @protected
   * @abstract
   * @method on
   * @description The abstract event router that must be implemented by subclasses to handle specific event types.
   * @param {IDomainEvent} event - The event to be handled.
   */
  protected abstract on(event: IDomainEvent): void;
}

// --- STUBBED DOMAIN EVENTS ---
// In a real application, each event would be in its own file under `domain/events`.

/**
 * @enum RewardsAccountTier
 * @description Represents the possible tiers a rewards account can have.
 */
export enum RewardsAccountTier {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

class RewardsAccountCreatedEvent implements IDomainEvent {
  public readonly eventType = 'RewardsAccountCreatedEvent';
  constructor(public readonly aggregateId: string, public readonly data: { customerId: string; initialPoints: number; initialTier: RewardsAccountTier; timestamp: Date; }) {}
  public get timestamp(): Date { return this.data.timestamp; }
}

class PointsEarnedEvent implements IDomainEvent {
  public readonly eventType = 'PointsEarnedEvent';
  constructor(public readonly aggregateId: string, public readonly data: { points: number; sourceTransactionId: string; timestamp: Date; }) {}
  public get timestamp(): Date { return this.data.timestamp; }
}

class PointsRedeemedEvent implements IDomainEvent {
  public readonly eventType = 'PointsRedeemedEvent';
  constructor(public readonly aggregateId: string, public readonly data: { points: number; reason: string; timestamp: Date; }) {}
  public get timestamp(): Date { return this.data.timestamp; }
}

class RewardsTierChangedEvent implements IDomainEvent {
  public readonly eventType = 'RewardsTierChangedEvent';
  constructor(public readonly aggregateId: string, public readonly data: { oldTier: RewardsAccountTier; newTier: RewardsAccountTier; timestamp: Date; }) {}
  public get timestamp(): Date { return this.data.timestamp; }
}

class RewardsAccountClosedEvent implements IDomainEvent {
  public readonly eventType = 'RewardsAccountClosedEvent';
  constructor(public readonly aggregateId: string, public readonly data: { reason: string; timestamp: Date; }) {}
  public get timestamp(): Date { return this.data.timestamp; }
}


// --- AGGREGATE DEFINITION ---

/**
 * @enum RewardsAccountStatus
 * @description Represents the lifecycle status of a rewards account.
 */
export enum RewardsAccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

/**
 * @interface RewardsAccountState
 * @description Defines the shape of the rewards account's state. This is the internal representation
 * of the aggregate's properties, which is built by applying domain events.
 * @property {string} id - The unique identifier for the rewards account aggregate.
 * @property {string} customerId - The identifier of the customer who owns this rewards account.
 * @property {number} pointsBalance - The current number of redeemable points.
 * @property {RewardsAccountTier} tier - The current loyalty tier of the account.
 * @property {RewardsAccountStatus} status - The current status of the account.
 */
export interface RewardsAccountState {
  id: string;
  customerId: string;
  pointsBalance: number;
  tier: RewardsAccountTier;
  status: RewardsAccountStatus;
}

/**
 * @class InsufficientPointsError
 * @extends Error
 * @description Custom error thrown when a redemption is attempted with insufficient points.
 */
export class InsufficientPointsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientPointsError';
  }
}

/**
 * @class InactiveRewardsAccountError
 * @extends Error
 * @description Custom error thrown when an operation is attempted on an inactive or closed account.
 */
export class InactiveRewardsAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InactiveRewardsAccountError';
  }
}

/**
 * @class RewardsAccountAggregate
 * @extends AggregateRoot<RewardsAccountState>
 * @description The aggregate root for the Rewards domain. It encapsulates the state and business logic
 * for a customer's rewards account, ensuring all state changes occur via domain events.
 */
export class RewardsAccountAggregate extends AggregateRoot<RewardsAccountState> {
  private _state!: RewardsAccountState;

  /**
   * @private
   * @constructor
   * @description The constructor is private to enforce creation through factory methods.
   */
  private constructor(id: string) {
    super(id);
  }

  /**
   * @getter id
   * @description Gets the unique identifier of the aggregate.
   * @returns {string} The aggregate's ID.
   */
  public get id(): string {
    return this._id;
  }

  /**
   * @getter state
   * @description Gets the current state of the aggregate.
   * @returns {RewardsAccountState} The current state.
   */
  public get state(): RewardsAccountState {
    return this._state;
  }

  /**
   * @static
   * @method create
   * @description Factory method to create a new RewardsAccountAggregate. This is the entry point
   * for creating a new rewards account.
   * @param {string} customerId - The ID of the customer.
   * @param {number} [initialPoints=0] - The initial number of points for the account.
   * @returns {RewardsAccountAggregate} A new instance of the RewardsAccountAggregate with an uncommitted creation event.
   */
  public static create(customerId: string, initialPoints: number = 0): RewardsAccountAggregate {
    if (!customerId) {
      throw new Error('Customer ID is required to create a rewards account.');
    }
    const id = uuidv4();
    const aggregate = new RewardsAccountAggregate(id);

    const event = new RewardsAccountCreatedEvent(id, {
      customerId,
      initialPoints,
      initialTier: RewardsAccountTier.BRONZE,
      timestamp: new Date(),
    });

    aggregate.applyChange(event);
    return aggregate;
  }

  /**
   * @method earnPoints
   * @description Public command method to add points to the account.
   * @param {number} points - The number of points to earn. Must be a positive integer.
   * @param {string} sourceTransactionId - The ID of the transaction that resulted in these points.
   * @throws {InactiveRewardsAccountError} If the account is not active.
   * @throws {Error} If the points amount is not a positive number.
   */
  public earnPoints(points: number, sourceTransactionId: string): void {
    if (this._state.status !== RewardsAccountStatus.ACTIVE) {
      throw new InactiveRewardsAccountError('Cannot earn points on an inactive or closed account.');
    }
    if (points <= 0) {
      throw new Error('Points to earn must be a positive number.');
    }

    const event = new PointsEarnedEvent(this.id, {
      points,
      sourceTransactionId,
      timestamp: new Date(),
    });

    this.applyChange(event);
  }

  /**
   * @method redeemPoints
   * @description Public command method to redeem points from the account.
   * @param {number} points - The number of points to redeem. Must be a positive integer.
   * @param {string} reason - A description for the redemption.
   * @throws {InactiveRewardsAccountError} If the account is not active.
   * @throws {InsufficientPointsError} If the redemption amount exceeds the current balance.
   * @throws {Error} If the points amount is not a positive number.
   */
  public redeemPoints(points: number, reason: string): void {
    if (this._state.status !== RewardsAccountStatus.ACTIVE) {
      throw new InactiveRewardsAccountError('Cannot redeem points from an inactive or closed account.');
    }
    if (points <= 0) {
      throw new Error('Points to redeem must be a positive number.');
    }
    if (this._state.pointsBalance < points) {
      throw new InsufficientPointsError(
        `Insufficient points. Current balance: ${this._state.pointsBalance}, attempted to redeem: ${points}`,
      );
    }

    const event = new PointsRedeemedEvent(this.id, {
      points,
      reason,
      timestamp: new Date(),
    });

    this.applyChange(event);
  }

  /**
   * @method changeTier
   * @description Changes the loyalty tier of the account.
   * @param {RewardsAccountTier} newTier - The new tier to assign to the account.
   * @throws {InactiveRewardsAccountError} if the account is not active.
   * @throws {Error} if the new tier is the same as the current tier.
   */
  public changeTier(newTier: RewardsAccountTier): void {
    if (this._state.status !== RewardsAccountStatus.ACTIVE) {
      throw new InactiveRewardsAccountError('Cannot change tier on an inactive or closed account.');
    }
    if (this._state.tier === newTier) {
      throw new Error(`Account is already at tier ${newTier}.`);
    }

    const event = new RewardsTierChangedEvent(this.id, {
      oldTier: this._state.tier,
      newTier,
      timestamp: new Date(),
    });

    this.applyChange(event);
  }

  /**
   * @method closeAccount
   * @description Closes the rewards account. This is a terminal state.
   * @param {string} reason - The reason for closing the account.
   * @throws {Error} If the account is already closed.
   */
  public closeAccount(reason: string): void {
    if (this._state.status === RewardsAccountStatus.CLOSED) {
      throw new Error('Account is already closed.');
    }

    const event = new RewardsAccountClosedEvent(this.id, {
      reason,
      timestamp: new Date(),
    });

    this.applyChange(event);
  }

  /**
   * @protected
   * @method on
   * @description The event application router. It calls the appropriate handler based on the event type.
   * This is part of the event sourcing pattern to mutate the aggregate's state.
   * @param {IDomainEvent} event - The domain event to apply.
   */
  protected on(event: IDomainEvent): void {
    switch (event.eventType) {
      case 'RewardsAccountCreatedEvent':
        this.onRewardsAccountCreated(event as RewardsAccountCreatedEvent);
        break;
      case 'PointsEarnedEvent':
        this.onPointsEarned(event as PointsEarnedEvent);
        break;
      case 'PointsRedeemedEvent':
        this.onPointsRedeemed(event as PointsRedeemedEvent);
        break;
      case 'RewardsTierChangedEvent':
        this.onRewardsTierChanged(event as RewardsTierChangedEvent);
        break;
      case 'RewardsAccountClosedEvent':
        this.onRewardsAccountClosed(event as RewardsAccountClosedEvent);
        break;
      default:
        throw new Error(`Unknown event type: ${event.eventType}`);
    }
  }

  /**
   * @private
   * @method onRewardsAccountCreated
   * @description Applies the RewardsAccountCreatedEvent to the aggregate's state.
   * @param {RewardsAccountCreatedEvent} event - The event to apply.
   */
  private onRewardsAccountCreated(event: RewardsAccountCreatedEvent): void {
    this._state = {
      id: event.aggregateId,
      customerId: event.data.customerId,
      pointsBalance: event.data.initialPoints,
      tier: event.data.initialTier,
      status: RewardsAccountStatus.ACTIVE,
    };
  }

  /**
   * @private
   * @method onPointsEarned
   * @description Applies the PointsEarnedEvent to the aggregate's state.
   * @param {PointsEarnedEvent} event - The event to apply.
   */
  private onPointsEarned(event: PointsEarnedEvent): void {
    this._state.pointsBalance += event.data.points;
  }

  /**
   * @private
   * @method onPointsRedeemed
   * @description Applies the PointsRedeemedEvent to the aggregate's state.
   * @param {PointsRedeemedEvent} event - The event to apply.
   */
  private onPointsRedeemed(event: PointsRedeemedEvent): void {
    this._state.pointsBalance -= event.data.points;
  }

  /**
   * @private
   * @method onRewardsTierChanged
   * @description Applies the RewardsTierChangedEvent to the aggregate's state.
   * @param {RewardsTierChangedEvent} event - The event to apply.
   */
  private onRewardsTierChanged(event: RewardsTierChangedEvent): void {
    this._state.tier = event.data.newTier;
  }

  /**
   * @private
   * @method onRewardsAccountClosed
   * @description Applies the RewardsAccountClosedEvent to the aggregate's state.
   * @param {RewardsAccountClosedEvent} event - The event to apply.
   */
  private onRewardsAccountClosed(event: RewardsAccountClosedEvent): void {
    this._state.status = RewardsAccountStatus.CLOSED;
  }
}
