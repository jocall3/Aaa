/**
 * This module requires the following dependencies:
 * - `uuid`: For generating unique identifiers.
 * - `bcrypt`: For hashing passwords.
 * Please ensure these are installed in your project, along with their respective types (`@types/uuid`, `@types/bcrypt`).
 */
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

// --- Domain Events ---
// In a real system, these would likely be in their own files under a domain/events directory.

/**
 * @interface IDomainEvent
 * @description Base interface for all domain events, ensuring they have a timestamp and type.
 */
export interface IDomainEvent {
    readonly occurredOn: Date;
    readonly eventType: string;
}

/**
 * @class UserRegisteredEvent
 * @description Event fired when a new user has successfully registered.
 * @implements {IDomainEvent}
 */
export class UserRegisteredEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserRegisteredEvent';

    constructor(
        public readonly aggregateId: string,
        public readonly email: string,
        public readonly passwordHash: string,
        public readonly firstName: string,
        public readonly lastName: string,
    ) {}
}

/**
 * @class UserEmailVerifiedEvent
 * @description Event fired when a user's account becomes active after email verification.
 * @implements {IDomainEvent}
 */
export class UserEmailVerifiedEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserEmailVerifiedEvent';

    constructor(public readonly aggregateId: string) {}
}

/**
 * @class UserPasswordChangedEvent
 * @description Event fired when a user successfully changes their password.
 * @implements {IDomainEvent}
 */
export class UserPasswordChangedEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserPasswordChangedEvent';

    constructor(
        public readonly aggregateId: string,
        public readonly newPasswordHash: string,
    ) {}
}

/**
 * @class UserProfileUpdatedEvent
 * @description Event fired when a user's profile information is updated.
 * @implements {IDomainEvent}
 */
export class UserProfileUpdatedEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserProfileUpdatedEvent';

    constructor(
        public readonly aggregateId: string,
        public readonly firstName: string,
        public readonly lastName: string,
    ) {}
}

/**
 * @class UserDeactivatedEvent
 * @description Event fired when a user account is deactivated.
 * @implements {IDomainEvent}
 */
export class UserDeactivatedEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserDeactivatedEvent';

    constructor(public readonly aggregateId: string, public readonly reason: string) {}
}

/**
 * @class UserLockedEvent
 * @description Event fired when a user account is locked (e.g., due to too many failed login attempts).
 * @implements {IDomainEvent}
 */
export class UserLockedEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserLockedEvent';

    constructor(public readonly aggregateId: string, public readonly reason: string) {}
}

/**
 * @class UserRoleAssignedEvent
 * @description Event fired when a new role is assigned to a user.
 * @implements {IDomainEvent}
 */
export class UserRoleAssignedEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserRoleAssignedEvent';

    constructor(public readonly aggregateId: string, public readonly role: string) {}
}

/**
 * @class UserRoleRevokedEvent
 * @description Event fired when a role is revoked from a user.
 * @implements {IDomainEvent}
 */
export class UserRoleRevokedEvent implements IDomainEvent {
    readonly occurredOn: Date = new Date();
    readonly eventType: string = 'UserRoleRevokedEvent';

    constructor(public readonly aggregateId: string, public readonly role: string) {}
}


// --- Aggregate Root ---

/**
 * @type UserStatus
 * @description Defines the possible lifecycle states of a user account.
 */
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED' | 'LOCKED';

/**
 * @class UserAggregate
 * @description Represents a user within the IAM domain. It is the aggregate root for the User entity.
 * It encapsulates the state of a user and the business logic that can be performed on it.
 * State changes are recorded as a series of domain events.
 */
export class UserAggregate {
    private _id: string;
    private _email: string;
    private _passwordHash: string;
    private _firstName: string;
    private _lastName: string;
    private _status: UserStatus;
    private _roles: Set<string> = new Set();
    private _createdAt: Date;
    private _updatedAt: Date;
    private _version: number = -1;
    private readonly _uncommittedEvents: IDomainEvent[] = [];

    /**
     * @constructor
     * @private To be instantiated via static factory methods or from event history.
     */
    private constructor() {}

    // --- Getters for state ---
    public get id(): string { return this._id; }
    public get email(): string { return this._email; }
    public get firstName(): string { return this._firstName; }
    public get lastName(): string { return this._lastName; }
    public get status(): UserStatus { return this._status; }
    public get roles(): string[] { return Array.from(this._roles); }
    public get version(): number { return this._version; }
    
    /**
     * @method getUncommittedEvents
     * @description Returns the list of events that have not yet been persisted.
     * @returns {IDomainEvent[]} An array of domain events.
     */
    public getUncommittedEvents(): IDomainEvent[] {
        return this._uncommittedEvents;
    }

    /**
     * @method markEventsAsCommitted
     * @description Clears the list of uncommitted events. To be called after events are persisted.
     */
    public markEventsAsCommitted(): void {
        this._uncommittedEvents.length = 0;
    }

    // --- Static Factory for creating a new User ---

    /**
     * @static
     * @method register
     * @description Factory method to create a new user. Validates input and creates a UserRegisteredEvent.
     * @param {object} data - The data for the new user.
     * @param {string} data.email - The user's email.
     * @param {string} data.password - The user's plain text password.
     * @param {string} data.firstName - The user's first name.
     * @param {string} data.lastName - The user's last name.
     * @returns {Promise<UserAggregate>} A new UserAggregate instance.
     */
    public static async register(data: { email: string; password: string; firstName: string; lastName: string }): Promise<UserAggregate> {
        // Business logic validation for registration
        if (!data.email || !data.password || !data.firstName || !data.lastName) {
            throw new Error("Missing required registration fields.");
        }
        // A more robust validation would check email format, password strength, etc.

        const passwordHash = await bcrypt.hash(data.password, 10);
        const user = new UserAggregate();
        const event = new UserRegisteredEvent(
            uuidv4(),
            data.email.toLowerCase(),
            passwordHash,
            data.firstName,
            data.lastName,
        );
        user.apply(event, true);
        return user;
    }

    // --- Methods to apply state changes from events ---

    /**
     * @method apply
     * @description Routes an event to the appropriate `on` method to apply state changes.
     * @param {IDomainEvent} event - The domain event to apply.
     * @param {boolean} isNew - Flag indicating if this is a new event to be committed.
     * @private
     */
    private apply(event: IDomainEvent, isNew: boolean): void {
        const handler = this[`on${event.eventType}`];
        if (handler) {
            handler.call(this, event);
        }
        if (isNew) {
            this._uncommittedEvents.push(event);
        }
        this._version++;
    }
    
    private onUserRegisteredEvent(event: UserRegisteredEvent): void {
        this._id = event.aggregateId;
        this._email = event.email;
        this._passwordHash = event.passwordHash;
        this._firstName = event.firstName;
        this._lastName = event.lastName;
        this._status = 'PENDING_VERIFICATION';
        this._createdAt = event.occurredOn;
        this._updatedAt = event.occurredOn;
        this._roles.add('user'); // Default role
    }
    
    private onUserEmailVerifiedEvent(event: UserEmailVerifiedEvent): void {
        this._status = 'ACTIVE';
        this._updatedAt = event.occurredOn;
    }

    private onUserPasswordChangedEvent(event: UserPasswordChangedEvent): void {
        this._passwordHash = event.newPasswordHash;
        this._updatedAt = event.occurredOn;
    }

    private onUserProfileUpdatedEvent(event: UserProfileUpdatedEvent): void {
        this._firstName = event.firstName;
        this._lastName = event.lastName;
        this._updatedAt = event.occurredOn;
    }
    
    private onUserDeactivatedEvent(event: UserDeactivatedEvent): void {
        this._status = 'DEACTIVATED';
        this._updatedAt = event.occurredOn;
    }

    private onUserLockedEvent(event: UserLockedEvent): void {
        this._status = 'LOCKED';
        this._updatedAt = event.occurredOn;
    }

    private onUserRoleAssignedEvent(event: UserRoleAssignedEvent): void {
        this._roles.add(event.role);
        this._updatedAt = event.occurredOn;
    }

    private onUserRoleRevokedEvent(event: UserRoleRevokedEvent): void {
        this._roles.delete(event.role);
        this._updatedAt = event.occurredOn;
    }
    
    // --- Public methods to enact business logic (Commands) ---

    /**
     * @method verifyEmail
     * @description Activates a user's account after their email has been verified.
     */
    public verifyEmail(): void {
        if (this._status !== 'PENDING_VERIFICATION') {
            throw new Error('User cannot be activated from its current state.');
        }
        const event = new UserEmailVerifiedEvent(this.id);
        this.apply(event, true);
    }

    /**
     * @method changePassword
     * @description Changes the user's password after validating the old one.
     * @param {string} oldPassword - The current plain text password.
     * @param {string} newPassword - The new plain text password.
     */
    public async changePassword(oldPassword: string, newPassword: string): Promise<void> {
        if (this._status !== 'ACTIVE') {
            throw new Error('Password can only be changed for an active user.');
        }
        const isMatch = await bcrypt.compare(oldPassword, this._passwordHash);
        if (!isMatch) {
            throw new Error('Invalid old password.');
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        const event = new UserPasswordChangedEvent(this.id, newPasswordHash);
        this.apply(event, true);
    }
    
    /**
     * @method updateProfile
     * @description Updates the user's first and last name.
     * @param {string} firstName - The new first name.
     * @param {string} lastName - The new last name.
     */
    public updateProfile(firstName: string, lastName: string): void {
        if (this._status === 'DEACTIVATED') {
            throw new Error('Cannot update profile for a deactivated user.');
        }
        if (!firstName || !lastName) {
            throw new Error('First name and last name cannot be empty.');
        }
        const event = new UserProfileUpdatedEvent(this.id, firstName, lastName);
        this.apply(event, true);
    }
    
    /**
     * @method deactivate
     * @description Deactivates the user's account.
     * @param {string} reason - The reason for deactivation.
     */
    public deactivate(reason: string): void {
        if (this._status === 'DEACTIVATED') {
            // Idempotent
            return;
        }
        const event = new UserDeactivatedEvent(this.id, reason);
        this.apply(event, true);
    }

    /**
     * @method lock
     * @description Locks a user's account.
     * @param {string} reason - The reason for locking the account.
     */
    public lock(reason: string): void {
        if (this._status === 'LOCKED' || this._status === 'DEACTIVATED') {
            return; // Idempotent
        }
        const event = new UserLockedEvent(this.id, reason);
        this.apply(event, true);
    }

    /**
     * @method assignRole
     * @description Assigns a role to the user.
     * @param {string} role - The role to assign.
     */
    public assignRole(role: string): void {
        if (!role || this._roles.has(role)) {
            return; // Idempotent
        }
        const event = new UserRoleAssignedEvent(this.id, role);
        this.apply(event, true);
    }

    /**
     * @method revokeRole
     * @description Revokes a role from the user.
     * @param {string} role - The role to revoke.
     */
    public revokeRole(role: string): void {
        if (!this._roles.has(role)) {
            return; // Idempotent
        }
        if (role === 'user') {
            throw new Error('Cannot revoke the base "user" role.');
        }
        const event = new UserRoleRevokedEvent(this.id, role);
        this.apply(event, true);
    }
    
    /**
     * @method fromHistory
     * @description Reconstitutes a UserAggregate instance from a history of its domain events.
     * @param {IDomainEvent[]} history - An ordered array of domain events.
     * @returns {UserAggregate} The reconstituted UserAggregate instance.
     */
    public static fromHistory(history: IDomainEvent[]): UserAggregate {
        const user = new UserAggregate();
        history.forEach(event => user.apply(event, false));
        return user;
    }
}
