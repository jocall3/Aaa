/**
 * @fileoverview This is the main entry point for the Payments Microservice.
 * It is responsible for bootstrapping the application, initializing all modules,
 * setting up the server, connecting to the database and message broker, and
 * handling graceful shutdown.
 * @version 1.0.0
 */

import 'dotenv/config';
import http from 'http';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { Pool } from 'pg';

import { config } from './config';
import { createLogger, Logger } from './utils/logger';

// Hexagonal Architecture: Adapters (Inbound/Outbound)
import { createHttpAdapter } from './adapters/in/http/server';
import { createKafkaConsumerAdapter } from './adapters/in/kafka/consumer';
import { EventStoreAdapter } from './adapters/out/persistence/event-store.adapter';
import { PaymentReadModelRepositoryAdapter } from './adapters/out/persistence/payment-read-model.repository.adapter';
import { KafkaEventBusAdapter } from './adapters/out/kafka/event-bus.adapter';

// Hexagonal Architecture: Application Core (Ports & Services)
import { CommandHandlers } from './application/services/command-handlers';
import { QueryHandlers } from './application/services/query-handlers';
import { IEventStorePort } from './application/ports/out/event-store.port';
import { IEventBusPort } from './application/ports/out/event-bus.port';
import { IPaymentReadModelRepositoryPort } from './application/ports/out/payment-read-model.repository.port';

/**
 * The main application class that encapsulates the microservice's lifecycle.
 * @class Application
 */
class Application {
  private logger: Logger;
  private expressApp: Express;
  private httpServer: http.Server;
  private kafkaClient: Kafka;
  private kafkaProducer: Producer;
  private kafkaConsumer: Consumer;
  private eventStoreDbPool: Pool;
  private readModelDbPool: Pool; // Example: could be another DB like Elasticsearch

  /**
   * Constructs the Application instance.
   * @constructor
   */
  constructor() {
    this.logger = createLogger(config.logLevel);
    this.expressApp = express();
    this.httpServer = http.createServer(this.expressApp);

    this.kafkaClient = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      // SSL and SASL configuration would go here for production
    });

    this.kafkaProducer = this.kafkaClient.producer();
    this.kafkaConsumer = this.kafkaClient.consumer({ groupId: config.kafka.consumerGroupId });

    this.eventStoreDbPool = new Pool({
      connectionString: config.database.eventStoreUrl,
    });

    this.readModelDbPool = new Pool({
      connectionString: config.database.readModelUrl,
    });

    this.setupGracefulShutdown();
  }

  /**
   * Initializes and starts the entire microservice.
   * @public
   * @async
   * @returns {Promise<void>}
   */
  public async start(): Promise<void> {
    this.logger.info('Starting Payments Service...');

    try {
      // 1. Connect to infrastructure
      this.logger.info('Connecting to infrastructure...');
      await this.kafkaProducer.connect();
      await this.kafkaConsumer.connect();
      await this.eventStoreDbPool.connect();
      await this.readModelDbPool.connect();
      this.logger.info('Infrastructure connections established.');

      // 2. Instantiate Adapters (implementations of ports)
      const eventStoreAdapter: IEventStorePort = new EventStoreAdapter(this.eventStoreDbPool);
      const eventBusAdapter: IEventBusPort = new KafkaEventBusAdapter(this.kafkaProducer);
      const paymentReadModelRepo: IPaymentReadModelRepositoryPort = new PaymentReadModelRepositoryAdapter(this.readModelDbPool);

      // 3. Instantiate Application Core (services, handlers)
      const commandHandlers = new CommandHandlers(eventStoreAdapter, eventBusAdapter);
      const queryHandlers = new QueryHandlers(paymentReadModelRepo);

      // 4. Setup Inbound Adapters (entry points to the application)
      // HTTP Adapter for Commands and Queries
      this.expressApp.use(express.json());
      this.expressApp.use('/api/v1', createHttpAdapter(commandHandlers, queryHandlers, this.logger));

      // Kafka Consumer Adapter for handling events
      const kafkaConsumerAdapter = createKafkaConsumerAdapter(
        this.kafkaConsumer,
        {
          // Placeholder for event handlers that update read models, etc.
          // e.g., paymentEventHandler: new PaymentEventHandler(paymentReadModelRepo)
        },
        this.logger
      );
      await kafkaConsumerAdapter.start();
      this.logger.info(`Kafka consumer started and subscribed to topics.`);

      // 5. Start HTTP Server
      this.httpServer.listen(config.port, () => {
        this.logger.info(`HTTP server listening on port ${config.port}`);
      });

    } catch (error) {
      this.logger.error('Failed to start application:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Handles graceful shutdown of the service.
   * Closes database connections, disconnects from Kafka, and stops the HTTP server.
   * @public
   * @async
   * @returns {Promise<void>}
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Payments Service...');

    // Stop receiving new requests
    if (this.httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer.close((err) => {
          if (err) return reject(err);
          this.logger.info('HTTP server closed.');
          resolve();
        });
      });
    }

    try {
      await this.kafkaConsumer.disconnect();
      this.logger.info('Kafka consumer disconnected.');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka consumer:', error);
    }

    try {
      await this.kafkaProducer.disconnect();
      this.logger.info('Kafka producer disconnected.');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer:', error);
    }

    try {
      await this.eventStoreDbPool.end();
      this.logger.info('Event store database pool closed.');
    } catch (error) {
      this.logger.error('Error closing event store database pool:', error);
    }

    try {
      await this.readModelDbPool.end();
      this.logger.info('Read model database pool closed.');
    } catch (error) {
      this.logger.error('Error closing read model database pool:', error);
    }

    this.logger.info('Shutdown complete.');
  }

  /**
   * Sets up process signal listeners for graceful shutdown.
   * @private
   */
  private setupGracefulShutdown(): void {
    const handleShutdown = async (signal: string) => {
      this.logger.warn(`Received ${signal}. Starting graceful shutdown...`);
      try {
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        this.logger.error('Graceful shutdown failed:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  }
}

/**
 * Main execution function.
 * It creates and starts the application instance and handles top-level errors.
 * @async
 */
async function bootstrap() {
  const app = new Application();

  // Global error handlers
  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    // It's generally recommended to exit on uncaught exceptions
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // It's generally recommended to exit on unhandled rejections
    process.exit(1);
  });

  await app.start();
}

bootstrap();
