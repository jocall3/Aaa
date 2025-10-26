/**
 * @file This file defines the universal error handling framework for the platform.
 * It establishes a hierarchy of custom, serializable error classes that must be used
 * across all microservices. This aligns with the "Mandate a Universal Error Handling
 * Framework" architectural directive.
 *
 * @see /docs/adr/ADR-009-universal-error-framework.md
 * @module libs/error-framework
 */

/**
 * A catalog of unique, consistent error codes used across the entire system.
 * This centralized catalog is essential for structured logging, monitoring,
 * and reliable error handling by clients or middleware.
 *
 * @enum {string}
 * @example
 * ```
 * GEN_001: General application error
 * DOM_001: Generic domain logic error
 * DOM_002: Validation failed
 * DOM_003: Resource not found
 * DOM_004: Resource conflict
 * INF_001: Generic infrastructure error
 * INF_002: Transient (retryable) infrastructure error
 * SEC_001: Authentication failed
 * SEC_002: Authorization failed / Access denied
 * ```
 */
export const ErrorCodes = {
  // General Errors (GEN_xxx)
  GENERAL_APPLICATION_ERROR: 'GEN_001',

  // Domain Errors (DOM_xxx)
  DOMAIN_ERROR: 'DOM_001',
  VALIDATION_ERROR: 'DOM_002',
  NOT_FOUND_ERROR: 'DOM_003',
  CONFLICT_ERROR: 'DOM_004',

  // Infrastructure Errors (INF_xxx)
  INFRASTRUCTURE_ERROR: 'INF_001',
  TRANSIENT_INFRASTRUCTURE_ERROR: 'INF_002',

  // Security Errors (SEC_xxx)
  AUTHENTICATION_ERROR: 'SEC_001',
  AUTHORIZATION_ERROR: 'SEC_002',
} as const;

type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * @interface BaseErrorProps
 * @description Defines the properties for constructing a BaseError.
 *
 * @property {string} message - A human-readable description of the error.
 * @property {ErrorCode} errorCode - A unique, cataloged code for the error.
 * @property {boolean} [isOperational=true] - True if the error is operational (expected), false if it's a programmer error.
 * @property {unknown} [cause] - The original error that caused this one.
 * @property {Record<string, unknown>} [context] - Additional contextual information.
 */
export interface BaseErrorProps {
  message: string;
  errorCode: ErrorCode;
  isOperational?: boolean;
  cause?: unknown;
  context?: Record<string, unknown>;
}

/**
 * @interface ISerializableError
 * @description Defines the shape of the serialized error object.
 */
export interface ISerializableError {
  name: string;
  message: string;
  errorCode: ErrorCode;
  isOperational: boolean;
  context?: Record<string, unknown>;
  stack?: string;
  cause?: unknown;
}

/**
 * @abstract
 * @class BaseError
 * @extends Error
 * @description The abstract base class for all custom errors in the framework.
 * It ensures that all errors are serializable and contain essential information
 * for logging, monitoring, and client responses.
 */
export abstract class BaseError extends Error implements ISerializableError {
  /**
   * A unique, cataloged code for the error.
   * @public
   * @readonly
   */
  public readonly errorCode: ErrorCode;

  /**
   * A flag indicating if this is an operational error (expected, handleable)
   * vs. a programmer error (a bug).
   * @public
   * @readonly
   */
  public readonly isOperational: boolean;

  /**
   * The original error that caused this one, for better stack tracing.
   * @public
   * @readonly
   */
  public readonly cause?: unknown;

  /**
   * Additional key-value pairs for context-specific information.
   * @public
   * @readonly
   */
  public readonly context?: Record<string, unknown>;

  /**
   * @constructor
   * @param {BaseErrorProps} props - The properties for the error.
   */
  constructor(props: BaseErrorProps) {
    super(props.message);
    this.name = this.constructor.name;
    this.errorCode = props.errorCode;
    this.isOperational = props.isOperational ?? true;
    this.cause = props.cause;
    this.context = props.context;

    // This captures the stack trace correctly in V8.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error object into a plain JSON object.
   * This is crucial for structured logging and for sending consistent
   * error responses over an API.
   *
   * @returns {ISerializableError} A plain object representation of the error.
   * @example
   * ```
   * const err = new NotFoundError('User not found');
   * const serialized = err.toJSON();
   * // serialized might look like:
   * // {
   * //   name: 'NotFoundError',
   * //   message: 'User not found',
   * //   errorCode: 'DOM_003',
   * //   isOperational: true,
   * //   stack: '...'
   * // }
   * ```
   */
  public toJSON(): ISerializableError {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      isOperational: this.isOperational,
      context: this.context,
      stack: this.stack,
      cause: this.cause,
    };
  }
}

// --- Domain Errors ---

/**
 * @class DomainError
 * @extends BaseError
 * @description Base class for errors related to business logic violations.
 * These are expected errors that arise from invalid operations within the domain.
 */
export class DomainError extends BaseError {
  /**
   * @constructor
   * @param {string} message - A human-readable description of the error.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message'>} [props] - Optional additional properties.
   */
  constructor(message: string, props?: Omit<BaseErrorProps, 'errorCode' | 'message'>) {
    super({ ...props, message, errorCode: ErrorCodes.DOMAIN_ERROR });
  }
}

/**
 * @interface ValidationErrorDetail
 * @description Represents a single validation failure for a specific field.
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string; // e.g., 'IS_EMPTY', 'INVALID_FORMAT'
}

/**
 * @class ValidationError
 * @extends DomainError
 * @description Thrown when input data fails validation rules (e.g., invalid format, missing fields).
 * It contains a list of detailed validation failures.
 */
export class ValidationError extends DomainError {
  /**
   * An array of detailed validation failures.
   * @public
   * @readonly
   */
  public readonly details: ValidationErrorDetail[];

  /**
   * @constructor
   * @param {string} message - A summary of the validation failure.
   * @param {ValidationErrorDetail[]} details - An array of specific field errors.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message' | 'context'>} [props] - Optional additional properties.
   */
  constructor(message: string, details: ValidationErrorDetail[], props?: Omit<BaseErrorProps, 'errorCode' | 'message' | 'context'>) {
    super(message, { ...props, context: { ...props?.context, details } });
    this.name = 'ValidationError';
    this.errorCode = ErrorCodes.VALIDATION_ERROR;
    this.details = details;
  }
}

/**
 * @class NotFoundError
 * @extends DomainError
 * @description Thrown when a requested resource or entity could not be found.
 */
export class NotFoundError extends DomainError {
  /**
   * @constructor
   * @param {string} message - A human-readable description of the error.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message'>} [props] - Optional additional properties.
   */
  constructor(message: string, props?: Omit<BaseErrorProps, 'errorCode' | 'message'>) {
    super(message, props);
    this.name = 'NotFoundError';
    this.errorCode = ErrorCodes.NOT_FOUND_ERROR;
  }
}

/**
 * @class ConflictError
 * @extends DomainError
 * @description Thrown when an operation cannot be completed because it conflicts
 * with the current state of a resource (e.g., creating a resource that already exists).
 */
export class ConflictError extends DomainError {
  /**
   * @constructor
   * @param {string} message - A human-readable description of the error.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message'>} [props] - Optional additional properties.
   */
  constructor(message: string, props?: Omit<BaseErrorProps, 'errorCode' | 'message'>) {
    super(message, props);
    this.name = 'ConflictError';
    this.errorCode = ErrorCodes.CONFLICT_ERROR;
  }
}

// --- Infrastructure Errors ---

/**
 * @class InfrastructureError
 * @extends BaseError
 * @description Base class for errors related to external systems like databases,
 * message brokers, or third-party APIs.
 */
export class InfrastructureError extends BaseError {
  /**
   * @constructor
   * @param {string} message - A human-readable description of the error.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message'>} [props] - Optional additional properties.
   */
  constructor(message: string, props?: Omit<BaseErrorProps, 'errorCode' | 'message'>) {
    super({ ...props, message, errorCode: ErrorCodes.INFRASTRUCTURE_ERROR });
  }
}

/**
 * @class TransientInfrastructureError
 * @extends InfrastructureError
 * @description Thrown when an error occurs with an external system that is likely temporary
 * and may be resolved by retrying the operation (e.g., network timeout, database deadlock).
 */
export class TransientInfrastructureError extends InfrastructureError {
  /**
   * @constructor
   * @param {string} message - A human-readable description of the error.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message'>} [props] - Optional additional properties.
   */
  constructor(message: string, props?: Omit<BaseErrorProps, 'errorCode' | 'message'>) {
    super(message, props);
    this.name = 'TransientInfrastructureError';
    this.errorCode = ErrorCodes.TRANSIENT_INFRASTRUCTURE_ERROR;
  }
}

// --- Security Errors ---

/**
 * @class AuthenticationError
 * @extends BaseError
 * @description Thrown when a user cannot be authenticated (e.g., invalid credentials, missing token).
 */
export class AuthenticationError extends BaseError {
  /**
   * @constructor
   * @param {string} message - A human-readable description of the error.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message'>} [props] - Optional additional properties.
   */
  constructor(message: string, props?: Omit<BaseErrorProps, 'errorCode' | 'message'>) {
    super({ ...props, message, errorCode: ErrorCodes.AUTHENTICATION_ERROR });
  }
}

/**
 * @class AuthorizationError
 * @extends BaseError
 * @description Thrown when an authenticated user does not have permission to perform an action.
 */
export class AuthorizationError extends BaseError {
  /**
   * @constructor
   * @param {string} message - A human-readable description of the error.
   * @param {Omit<BaseErrorProps, 'errorCode' | 'message'>} [props] - Optional additional properties.
   */
  constructor(message: string, props?: Omit<BaseErrorProps, 'errorCode' | 'message'>) {
    super({ ...props, message, errorCode: ErrorCodes.AUTHORIZATION_ERROR });
  }
}
