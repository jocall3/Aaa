/**
 * @file Main entry point for the Payments microservice.
 * @description This file is responsible for bootstrapping the NestJS application. It serves as the Composition Root,
 * where the application's dependency graph is composed and configured. It sets up the server, connects to external
 * services, applies global middleware, pipes, guards, and filters, and handles graceful shutdown.
 * This setup adheres to the principles of a modern, scalable, and maintainable microservice architecture as per the
 * overall architectural directives.
 * @module PaymentsService/Main
 * @see {@link ./app.module.ts} for the root application module.
 * @see ADR-002: "Standardize on NestJS Framework for Node.js Microservices"
 * @see ADR-009: "Universal Error Handling and Middleware Configuration"
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';

import { AppModule } from './app.module';
// The following imports are placeholders for shared library components as per architectural directives.
// import { AllExceptionsFilter } from '@shared/error-framework';
// import { OpaAuthorizationGuard } from '@shared/security';

/**
 * @function bootstrap
 * @description Initializes and starts the NestJS application.
 * This function orchestrates the entire startup sequence:
 * 1. Creates the NestJS application instance with the Pino logger.
 * 2. Retrieves the centralized configuration service.
 * 3. Applies security middleware (Helmet, CORS).
 * 4. Sets up global application behaviors:
 *    - A global API prefix and versioning.
 *    - Global pipes for input validation and transformation.
 *    - Global guards for centralized authorization (e.g., OPA).
 *    - Global filters for standardized error handling.
 * 5. Enables graceful shutdown hooks to ensure clean termination.
 * 6. Starts the HTTP server, listening for incoming requests.
 * @returns {Promise<void>} A promise that resolves when the application has started successfully.
 * @throws {Error} If any part of the bootstrap process fails, the error is logged and the process exits.
 */
async function bootstrap(): Promise<void> {
  // Create the NestJS application instance, using the Pino logger for structured, asynchronous logging.
  // `bufferLogs: true` ensures logs during startup are buffered and handled by Pino once it's ready.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Set the application-wide logger.
  app.useLogger(app.get(Logger));

  // Retrieve the centralized ConfigService to access environment variables.
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);

  // Apply essential security middleware.
  app.use(helmet());
  app.enableCors({
    // In a real environment, this should be configured to a specific origin.
    origin: configService.get<string>('CORS_ORIGIN', '*'),
    credentials: true,
  });

  // Set a global prefix for all routes to namespace the API.
  app.setGlobalPrefix('api');

  // Enable URI-based versioning for the API, e.g., /api/v1/payments.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Apply global pipes.
  // The ValidationPipe uses `class-validator` and `class-transformer` to enforce type-safe DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that do not have any decorators
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted values are provided
      transform: true, // Automatically transform payloads to DTO instances
    }),
  );

  // Placeholder for applying the global exception filter from the shared error-framework library.
  // This ensures all thrown exceptions are caught and mapped to a standard HTTP error response format.
  // app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  // Placeholder for applying the global authorization guard.
  // This guard would integrate with the central OPA service to enforce policies on every incoming request.
  // app.useGlobalGuards(new OpaAuthorizationGuard());

  // Enable graceful shutdown hooks. NestJS will listen for termination signals (SIGINT, SIGTERM)
  // and call the `onModuleDestroy()` and `onApplicationShutdown()` hooks in your modules.
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 3002);
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Payments Service is running on: ${await app.getUrl()}`);
  logger.log(`🌱 Environment: ${configService.get<string>('NODE_ENV')}`)
}

// Execute the bootstrap function and handle any unhandled promise rejections.
bootstrap().catch((error) => {
  // Using console.error here as the pino logger might not be initialized if NestFactory fails.
  console.error('❌ Fatal error during application bootstrap:', error);
  process.exit(1);
});
