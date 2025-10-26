/**
 * @file Main entry point for the Saga Orchestrator service.
 * @description This service is responsible for managing the state of distributed transactions (sagas)
 * according to the Saga Orchestration architectural pattern. It interprets state machine definitions
 * written in Amazon States Language (ASL), dispatches commands to participating microservices via
 * the event bus, listens for outcome events, and orchestrates compensating transactions upon failure.
 * @module SagaOrchestratorService
 * @see /docs/adr/ADR-001-saga-orchestration-pattern.md
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { Kafka, Consumer, Producer, ITopicConfig } from 'kafkajs';
import { Pool } from 'pg';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

// --- Configuration ---

const config = {
  port: process.env.PORT || 3005,
  logLevel: process.env.LOG_LEVEL || 'info',
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: 'saga-orchestrator-service',
    commandTopicPrefix: 'commands.',
    eventTopic: 'domain.events',
  },
  db: {
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/saga_state_store',
  },
  sagaDefinitionsPath: process.env.SAGA_DEFINITIONS_PATH || path.join(__dirname, '../sagas'),
};

const logger = pino({ level: config.logLevel });

// --- Core Interfaces & Types (as per architecture) ---

type SagaStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'COMPENSATING';

/**
 * @interface SagaExecution
 * @description Represents the state of a single, running saga instance.
 */
interface SagaExecution {
  executionId: string;
  sagaName: string;
  currentState: string;
  context: Record<string, any>;
  status: SagaStatus;
  history: { state: string; timestamp: string; context: Record<string, any> }[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @interface ISagaStateRepository
 * @description Port for the persistence adapter that manages saga execution state.
 */
interface ISagaStateRepository {
  findById(executionId: string): Promise<SagaExecution | null>;
  save(execution: SagaExecution): Promise<void>;
  create(sagaName: string, initialContext: Record<string, any>): Promise<SagaExecution>;
}

/**
 * @interface ICommandPublisher
 * @description Port for the adapter that sends commands to other services.
 */
interface ICommandPublisher {
  publish(topic: string, command: object): Promise<void>;
}

// --- Infrastructure Adapters ---

/**
 * @class KafkaCommandPublisher
 * @implements ICommandPublisher
 * @description Adapter to publish command messages to Kafka.
 */
class KafkaCommandPublisher implements ICommandPublisher {
  constructor(private producer: Producer) {}

  async publish(topic: string, command: object & { correlationId: string }): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{
        key: command.correlationId,
        value: JSON.stringify(command),
      }],
    });
    logger.info({ topic, correlationId: command.correlationId }, 'Published command to Kafka');
  }
}

/**
 * @class PostgresSagaStateRepository
 * @implements ISagaStateRepository
 * @description Adapter for persisting saga state to a PostgreSQL database.
 */
class PostgresSagaStateRepository implements ISagaStateRepository {
  constructor(private pool: Pool) {}

  async findById(executionId: string): Promise<SagaExecution | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM saga_executions WHERE execution_id = $1',
      [executionId]
    );
    if (rows.length === 0) {
      return null;
    }
    // Note: Type casting for simplicity. A real implementation would validate.
    return rows[0] as SagaExecution;
  }

  async save(execution: SagaExecution): Promise<void> {
    execution.updatedAt = new Date();
    const { executionId, sagaName, currentState, context, status, history, updatedAt } = execution;
    await this.pool.query(
      `UPDATE saga_executions SET
        current_state = $1, context = $2, status = $3, history = $4, updated_at = $5
       WHERE execution_id = $6`,
      [currentState, context, status, JSON.stringify(history), updatedAt, executionId]
    );
    logger.info({ executionId, newState: currentState, status }, 'Saved saga execution state.');
  }
  
  async create(sagaName: string, initialContext: Record<string, any>): Promise<SagaExecution> {
    const execution: SagaExecution = {
      executionId: uuidv4(),
      sagaName,
      context: initialContext,
      currentState: '__INIT__', // A pre-start state
      status: 'RUNNING',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { executionId, currentState, context, status, createdAt, updatedAt } = execution;

    await this.pool.query(
      `INSERT INTO saga_executions (execution_id, saga_name, current_state, context, status, history, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, '[]', $6, $7)`,
      [executionId, sagaName, currentState, context, status, createdAt, updatedAt]
    );
    logger.info({ executionId, sagaName }, 'Created new saga execution record.');
    return execution;
  }
}

// --- Saga Orchestration Engine ---

/**
 * @class SagaOrchestrator
 * @description The core engine that interprets ASL definitions and drives saga execution.
 */
class SagaOrchestrator {
  private sagaDefinitions: Map<string, any> = new Map();

  constructor(
    private stateRepository: ISagaStateRepository,
    private commandPublisher: ICommandPublisher,
  ) {}

  /**
   * @method loadDefinitions
   * @description Loads all saga ASL JSON definitions from the specified directory.
   */
  async loadDefinitions(): Promise<void> {
    logger.info(`Loading saga definitions from ${config.sagaDefinitionsPath}...`);
    try {
      const files = await fs.readdir(config.sagaDefinitionsPath);
      for (const file of files) {
        if (file.endsWith('.asl.json')) {
          const sagaName = path.basename(file, '.asl.json');
          const content = await fs.readFile(path.join(config.sagaDefinitionsPath, file), 'utf-8');
          this.sagaDefinitions.set(sagaName, JSON.parse(content));
          logger.info(`Loaded saga definition: ${sagaName}`);
        }
      }
    } catch (error) {
      logger.error(error, `Failed to load saga definitions.`);
      throw error;
    }
  }

  /**
   * @method start
   * @description Initiates a new execution of a named saga.
   * @param {string} sagaName - The name of the saga to start.
   * @param {object} initialContext - The initial data payload for the saga.
   * @returns {Promise<string>} The unique execution ID.
   */
  async start(sagaName: string, initialContext: object): Promise<string> {
    const definition = this.sagaDefinitions.get(sagaName);
    if (!definition) {
      throw new Error(`Saga definition '${sagaName}' not found.`);
    }

    const execution = await this.stateRepository.create(sagaName, { ...initialContext, __saga__: { executionId: uuidv4() } });
    execution.currentState = definition.StartAt;
    
    await this.step(execution);

    return execution.executionId;
  }
  
  /**
   * @method handleEvent
   * @description Processes an incoming event from the event bus.
   * @param {object} event - The domain event payload.
   */
  async handleEvent(event: { type: string, payload: any, correlationId: string }): Promise<void> {
    // A real implementation would have more robust mapping from event to saga.
    // Here we assume correlationId is the saga execution ID.
    const execution = await this.stateRepository.findById(event.correlationId);

    if (!execution || execution.status !== 'RUNNING') {
      logger.warn({ correlationId: event.correlationId }, 'Received event for non-running or unknown saga.');
      return;
    }
    
    // Simple logic: assume event type matches a state transition name for success or failure.
    // e.g., 'DebitSourceAccount' state expects 'AccountDebited' or 'DebitFailed' event.
    const definition = this.sagaDefinitions.get(execution.sagaName);
    const currentStateDefinition = definition.States[execution.currentState];
    
    if (currentStateDefinition.Type !== 'Task') return;
    
    // Naive success/failure mapping
    if (event.type.toLowerCase().includes('fail')) {
      // TODO: Implement Catch logic from ASL
      execution.currentState = 'FAIL_STATE'; // Placeholder
      execution.status = 'FAILED';
    } else {
      execution.currentState = currentStateDefinition.Next;
    }
    
    // Merge event payload into context
    execution.context = { ...execution.context, ...event.payload };

    await this.step(execution);
  }

  /**
   * @method step
   * @description Executes the logic for the current state of a saga instance.
   * @param {SagaExecution} execution - The saga instance to process.
   * @private
   */
  private async step(execution: SagaExecution): Promise<void> {
    const definition = this.sagaDefinitions.get(execution.sagaName);
    const stateDefinition = definition.States[execution.currentState];

    execution.history.push({ state: execution.currentState, timestamp: new Date().toISOString(), context: execution.context });

    switch (stateDefinition.Type) {
      case 'Task':
        // The resource is a "topic:Command" string
        const [topic, commandName] = stateDefinition.Resource.split(':');
        const command = {
          type: commandName,
          payload: this.mapParameters(stateDefinition.Parameters, execution.context),
          correlationId: execution.executionId,
        };
        await this.commandPublisher.publish(topic, command);
        // State is now waiting for reply event. Just save the current state.
        break;

      case 'Succeed':
        execution.status = 'SUCCEEDED';
        logger.info({ executionId: execution.executionId }, 'Saga SUCCEEDED.');
        break;

      case 'Fail':
        execution.status = 'FAILED';
        logger.error({ executionId: execution.executionId, cause: stateDefinition.Cause }, 'Saga FAILED.');
        // TODO: Trigger compensation logic here.
        break;
        
      default:
        logger.error({ stateType: stateDefinition.Type }, 'Unsupported state type');
        execution.status = 'FAILED';
        break;
    }
    
    await this.stateRepository.save(execution);
  }

  /**
   * Maps parameters from the saga context based on the ASL definition.
   * A simplified version of ASL parameter mapping.
   */
  private mapParameters(params: Record<string, string>, context: Record<string, any>): object {
      const output: Record<string, any> = {};
      for (const key in params) {
          const valuePath = params[key];
          if (valuePath.endsWith('.$')) {
              const contextPath = valuePath.substring(0, valuePath.length - 2);
              // Simplified path resolution, e.g., '$.amount' -> context.amount
              const pathParts = contextPath.split('.').slice(1);
              output[key] = pathParts.reduce((obj, part) => obj && obj[part], context);
          } else {
              output[key] = valuePath; // Static value
          }
      }
      return output;
  }
}

// --- Main Bootstrap Function ---

async function bootstrap() {
  logger.info('Starting Saga Orchestrator Service...');

  // 1. Initialize DB and Kafka clients
  const pgPool = new Pool({ connectionString: config.db.connectionString });
  await pgPool.connect();
  logger.info('Connected to PostgreSQL.');
  // TODO: Run DB migrations to create 'saga_executions' table.

  const kafka = new Kafka({ clientId: config.kafka.clientId, brokers: config.kafka.brokers });
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: `${config.kafka.clientId}-group` });
  await producer.connect();
  await consumer.connect();
  logger.info('Connected to Kafka.');

  // 2. Instantiate Adapters and Core Orchestrator
  const commandPublisher = new KafkaCommandPublisher(producer);
  const stateRepository = new PostgresSagaStateRepository(pgPool);
  const orchestrator = new SagaOrchestrator(stateRepository, commandPublisher);
  await orchestrator.loadDefinitions();

  // 3. Setup Kafka Consumer to listen for events
  await consumer.subscribe({ topic: config.kafka.eventTopic, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value.toString());
        logger.info({ event }, 'Received domain event.');
        // Basic routing, a real system might have more complex logic.
        if (event.correlationId) {
          await orchestrator.handleEvent(event);
        }
      } catch (error) {
        logger.error(error, 'Error processing incoming Kafka message.');
      }
    },
  });
  logger.info(`Subscribed to Kafka topic: ${config.kafka.eventTopic}`);

  // 4. Setup API Server
  const server: FastifyInstance = Fastify({ logger });
  
  server.post('/sagas/:sagaName/start', async (req: FastifyRequest<{ Params: { sagaName: string }, Body: object }>, reply) => {
    try {
      const { sagaName } = req.params;
      const initialContext = req.body;
      const executionId = await orchestrator.start(sagaName, initialContext);
      reply.code(202).send({ executionId });
    } catch (error: any) {
      logger.error(error, 'Failed to start saga.');
      reply.code(500).send({ error: error.message });
    }
  });

  await server.listen({ port: config.port as number, host: '0.0.0.0' });

  // 5. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.warn(`Received ${signal}. Shutting down...`);
    await server.close();
    await consumer.disconnect();
    await producer.disconnect();
    await pgPool.end();
    logger.info('Shutdown complete.');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch(err => {
  logger.fatal(err, 'Saga Orchestrator Service failed to bootstrap.');
  process.exit(1);
});
