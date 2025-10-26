import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { BaseError, ValidationError } from './errors';

/**
 * @fileoverview Defines a universal error handling middleware for all microservices.
 * @version 1.0.0
 * @see {@link ../docs/adr/ADR-009-error-handling-framework.md} for architectural decisions.
 * @module libs/error-framework/middleware
 */

/**
 * @interface ILogger
 * @description A simple, abstract logger interface to allow for dependency injection of any logging library (e.g., Pino, Winston).
 * @public
 */
export interface ILogger {
  /**
   * Logs a message at the 'error' level.
   * @param {string | object} message - The log message or a structured log object.
   * @param {...any[]} meta - Additional metadata.
   */
  error(message: string | object, ...meta: any[]): void;

  /**
   * Logs a message at the 'warn' level.
   * @param {string | object} message - The log message or a structured log object.
   * @param {...any[]} meta - Additional metadata.
   */
  warn(message: string | object, ...meta: any[]): void;
}

/**
 * @interface StructuredLog
 * @description Defines the schema for structured logs created by the error middleware, ensuring consistent observability.
 * @property {string} timestamp - ISO 8601 timestamp of when the error was handled.
 * @property {'ERROR' | 'WARN'} level - The severity of the log.
 * @property {string} errorCode - The unique, cataloged error code from the custom error class.
 * @property {string} message - The human-readable error message.
 * @property {string} errorId - A unique ID generated for this specific error instance for tracing.
 * @property {string | undefined} correlationId - A correlation ID from request headers (`x-correlation-id`) for tracing across services.
 * @property {string} path - The request path where the error occurred.
 * @property {string} method - The HTTP method of the request.
 * @property {object | undefined} details - Additional serializable details from the error (e.g., validation errors).
 * @property {string | undefined} stack - The error stack trace (only included in non-production environments).
 * @public
 */
interface StructuredLog {
  timestamp: string;
  level: 'ERROR' | 'WARN';
  errorCode: string;
  message: string;
  errorId: string;
  correlationId?: string;
  path: string;
  method: string;
  details?: object;
  stack?: string;
}

/**
 * @interface StandardHttpErrorResponse
 * @description Defines the standardized error response body sent to clients, providing a consistent contract.
 * @property {string} errorId - The unique ID for this error instance, which can be reported by clients for support and debugging.
 * @property {string} errorCode - The cataloged, machine-readable error code.
 * @property {string} message - A user-friendly error message.
 * @property {object | undefined} details - Optional structured details, typically for validation errors.
 * @public
 */
export interface StandardHttpErrorResponse {
  errorId: string;
  errorCode: string;
  message: string;
  details?: object;
}

/**
 * @function createErrorHandlerMiddleware
 * @description A factory function that creates the global error handling middleware.
 * This pattern allows for injecting dependencies like a logger and configuring environment-specific behavior.
 * As per the architectural directive on universal error handling, this middleware is mandatory for all services.
 * @param {object} [options={}] - Configuration options for the middleware.
 * @param {ILogger} [options.logger=console] - A logger instance that conforms to the ILogger interface. Defaults to the console.
 * @param {boolean} [options.isProduction=process.env.NODE_ENV === 'production'] - Flag to control exposure of stack traces and sensitive error details.
 * @returns {function} An Express.js compatible error handling middleware.
 * @public
 * @example
 * ```typescript
 * import express from 'express';
 * import pino from 'pino';
 * import { createErrorHandlerMiddleware } from '@libs/error-framework';
 *
 * const app = express();
 * const logger = pino();
 * // ... other middleware and routes
 * app.use(createErrorHandlerMiddleware({ logger, isProduction: process.env.NODE_ENV === 'production' }));
 * ```
 */
export const createErrorHandlerMiddleware = (options: { logger?: ILogger; isProduction?: boolean } = {}) => {
  const { logger = console, isProduction = process.env.NODE_ENV === 'production' } = options;

  /**
   * Intercepts all thrown errors, logs them in a structured format, and maps them to standardized HTTP responses.
   * It differentiates between known `BaseError` types from the framework and unexpected system errors.
   *
   * @param {Error | BaseError} err - The error object thrown by a route handler or previous middleware.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @param {NextFunction} next - The Express next function, used to pass control if headers are already sent.
   */
  return (err: Error | BaseError, req: Request, res: Response, next: NextFunction): void => {
    // If headers have already been sent, delegate to the default Express error handler.
    if (res.headersSent) {
      return next(err);
    }

    const errorId = randomUUID();
    const correlationId = (req.headers['x-correlation-id'] as string) || (req.headers['x-request-id'] as string);

    let httpStatus: number;
    let responseBody: StandardHttpErrorResponse;
    const logEntry: Partial<StructuredLog> = {
      timestamp: new Date().toISOString(),
      errorId,
      correlationId,
      path: req.originalUrl,
      method: req.method,
    };

    if (err instanceof BaseError) {
      // Handle known, custom errors from our framework
      httpStatus = err.httpStatus;

      Object.assign(logEntry, {
        level: err.logLevel,
        errorCode: err.errorCode,
        message: err.message,
        details: err.details,
        stack: isProduction ? undefined : err.stack,
      });

      responseBody = {
        errorId,
        errorCode: err.errorCode,
        message: err.message,
        // Only include details for validation errors in the response
        details: err instanceof ValidationError ? err.details : undefined,
      };
    } else {
      // Handle unexpected, unknown errors
      httpStatus = 500;
      const errorCode = 'UNEXPECTED_ERROR';
      const userMessage = 'An unexpected internal server error occurred.';

      Object.assign(logEntry, {
        level: 'ERROR',
        errorCode,
        message: err.message, // Log the actual error message
        stack: isProduction ? undefined : err.stack,
      });

      responseBody = {
        errorId,
        errorCode,
        message: isProduction ? userMessage : err.message,
      };
    }

    // Log the structured error details
    if (logEntry.level === 'WARN') {
      logger.warn(logEntry as StructuredLog);
    } else {
      logger.error(logEntry as StructuredLog);
    }

    res.status(httpStatus).json(responseBody);
  };
};
