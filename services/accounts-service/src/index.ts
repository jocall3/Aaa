/**
 * @file Main entry point for the Accounts microservice.
 * @description This file initializes the NestJS application, configures the server,
 * connects to external services via modules, sets up global middleware for concerns
 * like authorization and error handling, and starts the application. It fully embraces
 * the architectural shift towards a standardized, framework-driven approach.
 * @version 2.0.0
 * @module AccountsService/Main
 * @see {@link ./app.module.ts} for the root module that wires all components together.
 * @see ADR-011: "Standardize on NestJS Framework for Backend Services".
 */

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Assuming an AppModule exists at './app.module.ts' to wire up the service dependencies.
import { AppModule } from './app.module'; 

// Shared libraries mandated by the new architecture.
import { AllExceptionsFilter } from '@app/error-framework';
import { version } from '../package.json';

/**
 * Bootstraps and runs the Accounts microservice.
 *
 * This function orchestrates the startup sequence:
 * 1. Creates a NestJS application instance with a Fastify adapter for performance.
 * 2. Applies global configurations, middleware, pipes, and filters.
 * 3. Sets up OpenAPI (Swagger) documentation generation, fulfilling the "Docs-as-Code" directive.
 * 4. Enables graceful shutdown hooks.
 * 5. Starts the HTTP server to listen for incoming requests.
 *
 * @async
 * @function bootstrap
 * @returns {Promise<void>} A promise that resolves when the application is successfully running.
 * @throws {Error} Throws an error if the application fails to bootstrap.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      {
        // In production, a structured JSON logger like pino should be used.
        logger: process.env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : ['log', 'error', 'warn', 'debug', 'verbose'],
      },
    );

    const configService = app.get(ConfigService);

    // --- Global Middleware & Configuration ---

    app.enableCors({
      origin: configService.get<string>('CORS_ORIGIN', '*'), // Should be restrictive in production.
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });

    const globalPrefix = configService.get<string>('API_PREFIX', '/api');
    app.setGlobalPrefix(globalPrefix);

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    // Centralized Authorization (OPA) middleware is applied globally within the AppModule
    // to ensure all requests are authorized before reaching controllers.
    logger.log('Open Policy Agent (OPA) authorization middleware is configured in AppModule.');

    app.useGlobalFilters(new AllExceptionsFilter());
    logger.log('Global exception filter from @app/error-framework registered.');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // Strip properties that do not have any decorators.
        forbidNonWhitelisted: true, // Throw an error if non-whitelisted values are provided.
        transform: true, // Automatically transform payloads to DTO instances.
        disableErrorMessages: configService.get<string>('NODE_ENV') === 'production',
      }),
    );
    logger.log('Global ValidationPipe registered.');

    // --- OpenAPI (Swagger) Documentation ---
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Accounts Service')
      .setDescription(
        'Manages customer bank accounts, balances, and related operations. Adheres to DDD, CQRS, and Event Sourcing principles.',
      )
      .setVersion(version)
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${globalPrefix}/docs`, app, document);
    logger.log(`OpenAPI documentation available at ${globalPrefix}/docs`);

    // --- Microservice Event Listener ---
    // The application's connection to the event bus (e.g., Kafka) and its event handlers
    // are managed within the NestJS module system, abstracting away the direct setup.
    // e.g., app.connectMicroservice(...) is called within a module's onModuleInit.
    logger.log('Microservice event listeners will be started by their respective modules.');

    // --- Graceful Shutdown ---
    app.enableShutdownHooks();

    // --- Start Server ---
    const port = configService.get<number>('PORT', 3001);
    await app.listen(port, '0.0.0.0');
    logger.log(`🚀 Accounts Service is running on: http://localhost:${port}${globalPrefix}`);

  } catch (error) {
    logger.error('Fatal error during application bootstrap', error);
    process.exit(1);
  }
}

// Run the application bootstrap function.
bootstrap();
