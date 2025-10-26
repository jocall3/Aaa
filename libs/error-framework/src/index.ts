/**
 * @file Main entry point for the universal error handling framework.
 * @description This library provides a hierarchy of custom, serializable error classes
 *              that must be used across all microservices. This ensures consistent,
 *              structured error handling and reporting, aligning with architectural directives.
 * @module error-framework
 * @see /docs/adr/ADR-012-universal-error-handling.md
 */

/**
 * A type alias for a unique, cataloged error code string.
 * These codes should be centrally managed to avoid duplication.
 * @example 'AUTH-001'
 * @example 'ACC-1023'
 */
export type ErrorCode = string;

/**
 * A generic record type for providing additional, machine-readable context with an error.
 * @example { invalidFields: ['email', 'password'], attempt: 3 }
 */
export type ErrorContext = Record<string, unknown>;

/**
 * @class BaseError
 * @extends Error
 * @description The foundation of the custom error hierarchy. All other custom errors in the framework
 *              must extend this class. It ensures that all errors are serializable and carry a
 *              standard set of structured information.
 *
 * @property {ErrorCode} errorCode - A unique, cataloged code for this specific error.
 * @property {ErrorContext} [context] - Optional, arbitrary data providing context for the error.
 * @property {true} isSerializable - A flag to identify errors from this framework.
 * @property {boolean} isOperational - Indicates if this is an operational error (i.e., expected, like validation) vs. a programmer error.
 */
export abstract class BaseError extends Error {
  /** A unique, cataloged code for this specific error. */
  public readonly errorCode: ErrorCode;

  /** Optional, arbitrary data providing context for the error. */
  public readonly context?: ErrorContext;

  /** A flag to identify errors from this framework, useful for type guards. */
  public readonly isSerializable: true = true;

  /** Differentiates between operational errors (expected) and programmer errors (bugs). */
  public readonly isOperational: boolean;

  /**
   * Creates an instance of BaseError.
   *
   * @param {string} message - A human-readable description of the error.
   * @param {ErrorCode} errorCode - A unique, cataloged code for the error.
   * @param {boolean} isOperational - True if the error is an expected, operational failure.
   * @param {ErrorContext} [context] - Optional structured data about the error.
   *
   * @example
   * class MyCustomError extends BaseError {
   *   constructor(message: string) {
   *     super(message, 'MY-001', true);
   *   }
   * }
   */
  constructor(
    message: string,
    errorCode: ErrorCode,
    isOperational: boolean,
    context?: ErrorContext,
  ) {
    super(message);
    // Set the prototype explicitly to ensure `instanceof` works correctly
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.context = context;
    this.isOperational = isOperational;

    // Capture the stack trace, excluding the constructor call
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * @method toJSON
   * @description Returns a serializable, JSON-friendly representation of the error.
   * @returns {object} A plain object representing the error.
   */
  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      context: this.context,
    };
  }
}

/**
 * @class DomainError
 * @extends BaseError
 * @description Represents an error that occurs due to a violation of business rules or domain invariants.
 *              These are considered operational errors.
 * @example
 * if (balance < withdrawalAmount) {
 *   throw new DomainError('Insufficient funds for withdrawal.', 'ACC-010', {
 *     accountId: '123',
 *     balance,
 *     withdrawalAmount,
 *   });
 * }
 */
export class DomainError extends BaseError {
  constructor(message: string, errorCode: ErrorCode, context?: ErrorContext) {
    super(message, errorCode, true, context);
  }
}

/**
 * @class ValidationError
 * @extends DomainError
 * @description Represents an error due to invalid input data that fails validation checks.
 * @example
 * if (!isValidEmail(email)) {
 *   throw new ValidationError('Invalid email format.', 'VALID-002', {
 *     field: 'email',
 *     value: email,
 *   });
 * }
 */
export class ValidationError extends DomainError {
  constructor(message: string, errorCode: ErrorCode, context?: ErrorContext) {
    super(message, errorCode, context);
  }
}

/**
 * @class NotFoundError
 * @extends DomainError
 * @description Represents an error for a requested resource that could not be found.
 * @example
 * const user = await userRepository.findById(userId);
 * if (!user) {
 *   throw new NotFoundError(`User with ID '${userId}' not found.`, 'USER-404', {
 *     resource: 'User',
 *     id: userId,
 *   });
 * }
 */
export class NotFoundError extends DomainError {
  constructor(message: string, errorCode: ErrorCode, context?: ErrorContext) {
    super(message, errorCode, context);
  }
}

/**
 * @class AuthenticationError
 * @extends BaseError
 * @description Represents an error related to failed authentication (e.g., invalid credentials, expired token).
 */
export class AuthenticationError extends BaseError {
  constructor(message: string, errorCode: ErrorCode = 'AUTH-401', context?: ErrorContext) {
    super(message, errorCode, true, context);
  }
}

/**
 * @class AuthorizationError
 * @extends BaseError
 * @description Represents an error due to insufficient permissions to access a resource or perform an action.
 */
export class AuthorizationError extends BaseError {
  constructor(message: string, errorCode: ErrorCode = 'AUTH-403', context?: ErrorContext) {
    super(message, errorCode, true, context);
  }
}

/**
 * @class InfrastructureError
 * @extends BaseError
 * @description Base class for errors related to external systems like databases, message brokers, or other microservices.
 *              These are generally not considered operational unless they are transient.
 * @property {boolean} isRetryable - Indicates whether the failed operation can be safely retried.
 */
export abstract class InfrastructureError extends BaseError {
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    errorCode: ErrorCode,
    isRetryable: boolean,
    context?: ErrorContext,
  ) {
    // Infrastructure errors are generally not considered 'operational' from a business perspective
    super(message, errorCode, false, context);
    this.isRetryable = isRetryable;
  }
}

/**
 * @class TransientInfrastructureError
 * @extends InfrastructureError
 * @description Represents a temporary, retryable failure in an external system (e.g., network timeout, DB deadlock).
 * @example
 * catch (dbError) {
 *   if (isDbDeadlock(dbError)) {
 *      throw new TransientInfrastructureError('Database deadlock detected.', 'DB-503', { query: '...' });
 *   }
 * }
 */
export class TransientInfrastructureError extends InfrastructureError {
  constructor(message: string, errorCode: ErrorCode, context?: ErrorContext) {
    super(message, errorCode, true, context);
  }
}

/**
 * @class FatalInfrastructureError
 * @extends InfrastructureError
 * @description Represents a permanent, non-retryable failure in an external system (e.g., bad credentials, disk full).
 * @example
 * catch (kafkaError) {
 *   if (isAuthFailure(kafkaError)) {
 *      throw new FatalInfrastructureError('Kafka authentication failed.', 'KAFKA-500');
 *   }
 * }
 */
export class FatalInfrastructureError extends InfrastructureError {
  constructor(message: string, errorCode: ErrorCode, context?: ErrorContext) {
    super(message, errorCode, false, context);
  }
}

/**
 * A type guard to check if an error is an instance of a class from this framework.
 *
 * @function isBaseError
 * @param {unknown} error - The value to check.
 * @returns {boolean} True if the value is a BaseError, false otherwise.
 *
 * @example
 * try {
 *   // ...
 * } catch (error: unknown) {
 *   if (isBaseError(error)) {
 *     // Now you can safely access error.errorCode, etc.
 *     logStructuredError(error);
 *   } else {
 *     logGenericError(error);
 *   }
 * }
 */
export const isBaseError = (error: unknown): error is BaseError => {
  return error instanceof BaseError && error.isSerializable === true;
};
