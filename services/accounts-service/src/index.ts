/**
 * @file Main entry point for the Accounts microservice.
 * @description This file initializes the server, connects to external services (Kafka, PostgreSQL),
 * sets up dependency injection, and starts the application. It also handles graceful shutdown, adhering to
 * Hexagonal and CQRS/ES architectural principles.
 * @version 1.0.0
 */

// Standard library imports
import process from 'node:process';
import crypto from 'node:crypto';

// Third-party imports
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import pino from 'pino';
import { Kafka, Consumer, Producer, ITopicConfig } from 'kafkajs';
import { Pool } from 'pg';

// --- Domain & Application Ports (Interfaces) ---

/**
 * @interface IEvent
 * @description Represents a generic domain event within the system.
 */
interface IEvent {
  /** The unique type identifier for the event. */
  type: string;
  /** The data associated with the event. */
  payload: any;
}

/**
 * @interface IEventStore
 * @description Port for secondary adapter that handles event persistence.
 */
interface IEventStore {
  /**
   * Saves a sequence of events for a given aggregate.
   * @param {string} aggregateId - The ID of the aggregate root.
   * @param {IEvent[]} events - The array of domain events to save.
   * @param {number} expectedVersion - The expected version of the aggregate for optimistic concurrency control.
   * @returns {Promise<void>}
   */
  saveEvents(aggregateId: string, events: IEvent[], expectedVersion: number): Promise<void>;

  /**
   * Retrieves all events for a given aggregate.
   * @param {string} aggregateId - The ID of the aggregate root.
   * @returns {Promise<IEvent[]>} A promise that resolves to an array of events.
   */
  getEventsForAggregate(aggregateId: string): Promise<IEvent[]>;
}

/**
 * @interface IEventPublisher
 * @description Port for secondary adapter that handles publishing events to a message bus.
 */
interface IEventPublisher {
  /**
   * Publishes an event to a specified topic.
   * @param {string} topic - The topic to publish the event to.
   * @param {IEvent} event - The event to publish.
   * @returns {Promise<void>}
   */
  publish(topic: string, event: IEvent): Promise<void>;
}

// --- Infrastructure Adapters ---

/**
 * @class KafkaEventPublisher
 * @implements {IEventPublisher}
 * @description An adapter that publishes domain events to an Apache Kafka topic.
 */
class KafkaEventPublisher implements IEventPublisher {
  /**
   * Creates an instance of KafkaEventPublisher.
   * @param {Producer} producer - A connected Kafka producer instance.
   * @param {pino.Logger} logger - The application logger.
   */
  constructor(private producer: Producer, private logger: pino.Logger) {}

  public async publish(topic: string, event: IEvent): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(event) }],
      });
      this.logger.info({ event, topic }, 'Event published to Kafka');
    } catch (error) {
      this.logger.error({ error, event, topic }, 'Failed to publish event to Kafka');
      throw error;
    }
  }
}

/**
 * @class PostgresEventStore
 * @implements {IEventStore}
 * @description An adapter that persists domain events to a PostgreSQL database.
 */
class PostgresEventStore implements IEventStore {
  /**
   * Creates an instance of PostgresEventStore.
   * @param {Pool} pool - A connected node-postgres Pool instance.
   */
  constructor(private pool: Pool) {}

  public async saveEvents(aggregateId: string, events: IEvent[], expectedVersion: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // In a real CQRS/ES system, you would SELECT the current version and compare with expectedVersion.
      for (const event of events) {
        await client.query(
          'INSERT INTO events (aggregate_id, type, payload) VALUES ($1, $2, $3)',
          [aggregateId, event.type, event.payload]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  public async getEventsForAggregate(aggregateId: string): Promise<IEvent[]> {
    const res = await this.pool.query('SELECT type, payload FROM events WHERE aggregate_id = $1 ORDER BY sequence_number ASC', [aggregateId]);
    return res.rows.map(row => ({ type: row.type, payload: row.payload }));
  }
}

// --- Application Layer (Command & Query Handlers) ---

/**
 * Factory for creating the account creation command handler.
 * @param {IEventStore} eventStore - The event store adapter.
 * @param {IEventPublisher} eventPublisher - The event publisher adapter.
 * @returns An async function that handles the account creation command.
 */
const createAccountCommandHandler = (eventStore: IEventStore, eventPublisher: IEventPublisher) => async (payload: { owner: string; initialBalance: number }) => {
  // Business logic and validation would go here.
  const accountId = crypto.randomUUID();
  const event: IEvent = { type: 'AccountCreated', payload: { accountId, owner: payload.owner, initialBalance: payload.initialBalance, timestamp: new Date().toISOString() } };
  await eventStore.saveEvents(accountId, [event], -1); // -1 indicates new aggregate
  await eventPublisher.publish('account-events', event);
  return { accountId };
};

/**
 * Factory for creating the get account query handler.
 * @param {Pool} readDbPool - The connection pool for the read model database.
 * @returns An async function that handles the get account query.
 */
const getAccountQueryHandler = (readDbPool: Pool) => async (accountId: string) => {
  const { rows } = await readDbPool.query('SELECT * FROM accounts_read_model WHERE account_id = $1', [accountId]);
  return rows[0] || null;
};


/**
 * Main application bootstrapping function.
 * Orchestrates the startup sequence of the microservice.
 * @async
 * @function bootstrap
 * @returns {Promise<void>}
 */
async function bootstrap() {
  const logger = pino({ level: process.env.LOG_LEVEL || 'info', transport: { target: 'pino-pretty' } });

  try {
    logger.info('Bootstrapping Accounts Service...');

    // 1. Configuration Loading
    const config = {
      server: { port: parseInt(process.env.PORT || '3000', 10) },
      kafka: {
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
        clientId: 'accounts-service',
        groupId: 'accounts-service-group',
        topics: {
          accountEvents: 'account-events',
        },
      },
      postgres: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'user',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'accounts_event_store',
      },
      // In a full implementation, read model might have its own config.
      readModelDb: {
        host: process.env.READ_DB_HOST || 'localhost',
        port: parseInt(process.env.READ_DB_PORT || '5432', 10),
        user: process.env.READ_DB_USER || 'user',
        password: process.env.READ_DB_PASSWORD || 'password',
        database: process.env.READ_DB_NAME || 'accounts_read_model_db',
      }
    };
    logger.info('Configuration loaded.');

    // 2. Initialize Adapters & Core Logic
    logger.info('Initializing infrastructure adapters...');
    const kafkaClient = new Kafka({ clientId: config.kafka.clientId, brokers: config.kafka.brokers });
    const producer = kafkaClient.producer();
    const consumer = kafkaClient.consumer({ groupId: config.kafka.groupId });

    const writeDbPool = new Pool(config.postgres);
    const readDbPool = new Pool(config.readModelDb);

    const eventStore = new PostgresEventStore(writeDbPool);
    const eventPublisher = new KafkaEventPublisher(producer, logger);

    logger.info('Initializing application command and query handlers...');
    const commandHandlers = {
      createAccount: createAccountCommandHandler(eventStore, eventPublisher),
    };
    const queryHandlers = {
      getAccount: getAccountQueryHandler(readDbPool),
    };

    // 3. Setup HTTP Server (Primary Adapter)
    const server: FastifyInstance = Fastify({ logger });
    server.get('/health', async () => ({ status: 'ok', service: 'accounts-service' }));
    server.post('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await commandHandlers.createAccount(request.body as any);
        reply.code(201).send(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error processing createAccount command');
        reply.code(500).send({ error: 'Internal Server Error' });
      }
    });
    server.get('/accounts/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const account = await queryHandlers.getAccount(request.params.id);
        account ? reply.send(account) : reply.code(404).send({ error: 'Account not found' });
      } catch (error: any) {
        logger.error({ err: error }, 'Error processing getAccount query');
        reply.code(500).send({ error: 'Internal Server Error' });
      }
    });

    // 4. Setup Kafka Consumer for Read Model Projection
    const setupConsumer = async () => {
      await consumer.subscribe({ topic: config.kafka.topics.accountEvents, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          const event: IEvent = JSON.parse(message.value.toString());
          logger.info({ eventType: event.type }, 'Projecting event to read model');
          if (event.type === 'AccountCreated') {
            const { accountId, owner, initialBalance } = event.payload;
            await readDbPool.query(
              'INSERT INTO accounts_read_model (account_id, owner, balance, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (account_id) DO NOTHING',
              [accountId, owner, initialBalance]
            );
          }
          // ... Handle other events like 'MoneyDeposited', 'MoneyWithdrawn' to update the balance.
        },
      });
    };

    // 5. Start Application Components
    await Promise.all([
        producer.connect(),
        consumer.connect(),
        writeDbPool.connect(),
        readDbPool.connect()
    ]);
    logger.info('Connected to Kafka and PostgreSQL.');

    await setupConsumer();
    logger.info(`Kafka consumer subscribed to topic: ${config.kafka.topics.accountEvents}`);
    
    await server.listen({ port: config.server.port, host: '0.0.0.0' });

    // 6. Graceful Shutdown Handler
    const shutdown = async (signal: string) => {
      logger.warn(`Received ${signal}. Shutting down gracefully...`);
      await server.close();
      await consumer.disconnect();
      await producer.disconnect();
      await writeDbPool.end();
      await readDbPool.end();
      logger.info('Shutdown complete.');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    logger.fatal({ err: error }, 'Application failed to bootstrap');
    process.exit(1);
  }
}

// Run the application
bootstrap();
