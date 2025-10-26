/**
 * @file Main entry point for the Rewards Microservice.
 * @description This file is responsible for bootstrapping the NestJS application. It sets up the server,
 * connects to the event bus, applies global middleware for error handling, logging, and security,
 * and enables graceful shutdown. This setup aligns with the architectural directives for a robust,
 * observable, and secure microservice.
 *
 * @version 2.0.0
 * @author Elite AI Implementation Team
 * @see {@link ./app.module.ts} for the root application module.
 * @see ADR-003: "Standardized Microservice Bootstrap".
 * @see ADR-012: "Universal Error Handling Framework".
 * @see ADR-015: "Docs-as-Code and Living Documentation".
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from '@/shared/error-framework'; // Assumed shared error framework
import { LoggingInterceptor } from '@/shared/logging-interceptor'; // Assumed shared logging interceptor
import { OPAAuthorizationGuard } from '@/shared/opa-guard'; // Assumed shared OPA guard
import { AppModule } from './app.module';

/**
 * @async
 * @function bootstrap
 * @summary Initializes and starts the Rewards microservice.
 *
 * @description
 * This function orchestrates the entire startup sequence of the service:
 * 1.  Creates a NestJS application instance using the root `AppModule`.
 * 2.  Retrieves centralized configuration using `ConfigService`.
 * 3.  Applies global security middleware (Helmet, CORS, etc.).
 * 4.  Sets up global pipes for request validation.
 * 5.  Sets up global interceptors for structured logging, as per observability directives.
 * 6.  Applies the universal global exception filter from the shared `error-framework`.
 * 7.  Configures API versioning and a global route prefix.
 * 8.  Sets up and connects to the Kafka event bus as a microservice transport layer,
 *     fulfilling the "Abstracted Event Bus" directive.
 * 9.  Generates and serves an OpenAPI (Swagger) specification, which is crucial for the
 *     "Living Documentation Portal" mandate.
 * 10. Binds a global guard for centralized authorization checks with OPA.
 * 11. Starts the HTTP server and the microservice listeners.
 * 12. Enables graceful shutdown hooks.
 *
 * @returns {Promise<void>} A promise that resolves when the application has successfully started.
 * @throws {Error} If any part of the bootstrap process fails.
 */
async function bootstrap(): Promise<void> {
  // Create NestJS application instance with Pino logger for structured logging.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until the logger is ready.
  });

  const pinoLogger = app.get(Logger);
  app.useLogger(pinoLogger);

  const configService = app.get(ConfigService);

  // --- Global Middleware and Configuration ---

  // Security middleware, as per standard security practices.
  app.use(helmet());
  app.enableCors(configService.get('cors'));

  // Global validation pipe to enforce type safety on DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that do not have any decorators
      transform: true, // Automatically transform payloads to DTO instances
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted properties are present
    }),
  );

  // Apply the universal logging interceptor to ensure structured, consistent request/response logging.
  app.useGlobalInterceptors(new LoggingInterceptor('RewardsService'));

  // Apply the universal exception filter to standardize error responses across all services.
  // This fulfills the "Universal Error Handling Framework" directive.
  app.useGlobalFilters(new AllExceptionsFilter(pinoLogger));

  // Centralized Authorization: Bind the OPA guard globally.
  // Every request will be sent to the OPA service for an authorization decision.
  app.useGlobalGuards(new OPAAuthorizationGuard(configService.get('opa.url')));

  // API Versioning and Prefixing.
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // --- OpenAPI (Swagger) Documentation Setup ---
  // This is a cornerstone of the "Docs-as-Code" and "Living Documentation" directives.
  // The generated spec is ingested by the documentation portal.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Rewards Service')
    .setDescription(
      'Manages customer rewards, loyalty points, and redemptions. Part of the Elite Financial Services Platform.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Rewards Commands', 'Write operations for the rewards domain.')
    .addTag('Rewards Queries', 'Read operations for rewards data.')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
  pinoLogger.log('OpenAPI documentation available at /docs');

  // --- Event Bus (Microservice Transport) Connection ---
  // Connect to Kafka to listen for domain events from other services (e.g., PaymentCompletedEvent).
  // This aligns with the "Abstracted Event Bus" and "Saga Orchestration" patterns.
  // The actual eventing logic is abstracted within a shared library,
  // configured here via NestJS microservice options.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: configService.get<string[]>('kafka.brokers'),
        clientId: configService.get<string>('kafka.clientId'),
        // In a real production setup, SASL/SSL options would be configured here from a secret store.
      },
      consumer: {
        groupId: configService.get<string>('kafka.consumerGroupId'),
      },
    },
  });

  // --- Graceful Shutdown ---
  app.enableShutdownHooks();

  // --- Start Application ---
  try {
    await app.startAllMicroservices();
    pinoLogger.log('Connected to Kafka and listening for events.');

    const port = configService.get<number>('port');
    await app.listen(port);
    pinoLogger.log(`Rewards Service is running on: ${await app.getUrl()}`);
  } catch (error) {
    pinoLogger.error('Failed to start the application', error);
    await app.close();
    process.exit(1);
  }
}

// Run the application bootstrap function.
bootstrap().catch((error) => {
  // Use a plain console.error here as the logger might not be initialized.
  console.error('Unhandled exception during bootstrap', error);
  process.exit(1);
});
