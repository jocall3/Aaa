/**
 * @fileoverview Centralized configuration for the Saga Orchestrator microservice.
 * @description This file consolidates all environment-specific variables and settings,
 * making the application portable and manageable across different environments.
 * It strictly separates configuration from code, loading all values from environment variables.
 *
 * This configuration supports the core functions of the Saga Orchestrator:
 * - Connecting to the event bus (Kafka) to listen for saga events and publish commands.
 * - Persisting saga state to a state store (PostgreSQL).
 * - Interacting with AWS Step Functions for executing saga state machines defined in ASL.
 * - Retrieving secrets from HashiCorp Vault.
 *
 * @version 1.0.0
 * @module config
 * @see ADR-001: Implement a Saga Orchestration Pattern for Distributed Transactions
 */

import dotenv from 'dotenv';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * @interface ISagaOrchestratorConfig
 * @description Defines the shape of the configuration object for the Saga Orchestrator service.
 *              Provides strong typing for all environment-derived settings.
 */
export interface ISagaOrchestratorConfig {
  /**
   * @property {string} env - The current application environment.
   * @example 'development', 'production', 'test'
   */
  env: string;

  /**
   * @property {number} port - The port number on which the service will listen for incoming requests.
   */
  port: number;

  /**
   * @property {string} logLevel - The level of logging verbosity.
   * @example 'info', 'debug', 'warn', 'error'
   */
  logLevel: string;

  /**
   * @property {object} eventBus - Configuration for the Apache Kafka event bus.
   */
  eventBus: {
    /**
     * @property {string[]} brokers - An array of Kafka broker host:port strings.
     */
    brokers: string[];
    /**
     * @property {string} clientId - A unique identifier for this client.
     */
    clientId: string;
    /**
     * @property {string} groupId - The consumer group ID for this service instance.
     */
    groupId: string;
    /**
     * @property {object} topics - A map of logical topic names to actual Kafka topic names for saga coordination.
     */
    topics: {
      /**
       * @property {string} sagaCommands - Topic for publishing commands to start or advance sagas.
       */
      sagaCommands: string;
      /**
       * @property {string} sagaEvents - Topic for listening to events from services that are part of a saga.
       */
      sagaEvents: string;
    };
  };

  /**
   * @property {object} sagaStateStore - Configuration for the saga state persistence database (PostgreSQL).
   */
  sagaStateStore: {
    /**
     * @property {string} host - The hostname of the PostgreSQL database server.
     */
    host: string;
    /**
     * @property {number} port - The port number of the PostgreSQL database server.
     */
    port: number;
    /**
     * @property {string} user - The username for the PostgreSQL database connection.
     */
    user: string;
    /**
     * @property {string} password - The password for the PostgreSQL database connection. Should be retrieved from Vault.
     */
    password?: string;
    /**
     * @property {string} database - The name of the PostgreSQL database for saga state.
     */
    database: string;
  };

  /**
   * @property {object} aws - Configuration for AWS services, primarily Step Functions.
   */
  aws: {
    /**
     * @property {string} region - The AWS region where services are deployed.
     */
    region: string;
    /**
     * @property {string} accessKeyId - AWS access key ID. Should be retrieved from Vault.
     */
    accessKeyId?: string;
    /**
     * @property {string} secretAccessKey - AWS secret access key. Should be retrieved from Vault.
     */
    secretAccessKey?: string;
    /**
     * @property {object} sfn - Configuration for AWS Step Functions.
     */
    sfn: {
      /**
       * @property {string} stateMachineArnPrefix - The prefix for all saga state machine ARNs.
       * @example 'arn:aws:states:us-east-1:123456789012:stateMachine:'
       */
      stateMachineArnPrefix: string;
    };
  };

  /**
   * @property {object} security - Configuration for the Zero Trust security model.
   */
  security: {
    /**
     * @property {object} vault - HashiCorp Vault settings for runtime secret retrieval.
     */
    vault: {
      /**
       * @property {string} address - The URL of the HashiCorp Vault server.
       */
      address: string;
      /**
       * @property {string} token - The Vault token for authentication (in dev) or path to auth method.
       */
      token?: string;
      /**
       * @property {string} roleId - The AppRole RoleID for authentication in production environments.
       */
      roleId?: string;
      /**
       * @property {string} secretId - The AppRole SecretID for authentication in production environments.
       */
      secretId?: string;
      /**
       * @property {string} secretsPath - The base path in Vault where this service's secrets are stored.
       * @example 'secret/data/saga-orchestrator-service'
       */
      secretsPath: string;
    };
  };
}

/**
 * @const {ISagaOrchestratorConfig} config
 * @description The main configuration object, populated from environment variables.
 *              Provides default values for a development environment where appropriate.
 */
const config: ISagaOrchestratorConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.SAGA_ORCHESTRATOR_PORT || '3010', 10),
  logLevel: process.env.LOG_LEVEL || 'info',

  eventBus: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: 'saga-orchestrator-service',
    groupId: 'saga-orchestrator-group',
    topics: {
      sagaCommands: process.env.KAFKA_TOPIC_SAGA_COMMANDS || 'saga.commands',
      sagaEvents: process.env.KAFKA_TOPIC_SAGA_EVENTS || 'domain.>', // Example for listening to all domain events
    },
  },

  sagaStateStore: {
    host: process.env.SAGA_DB_HOST || 'localhost',
    port: parseInt(process.env.SAGA_DB_PORT || '5432', 10),
    user: process.env.SAGA_DB_USER || 'saga_user',
    password: process.env.SAGA_DB_PASSWORD, // Must be provided via env/secret manager
    database: process.env.SAGA_DB_NAME || 'saga_state_store',
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Should be retrieved from Vault
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Should be retrieved from Vault
    sfn: {
      stateMachineArnPrefix: `arn:aws:states:${process.env.AWS_REGION || 'us-east-1'}:${process.env.AWS_ACCOUNT_ID || '000000000000'}:stateMachine:`,
    },
  },

  security: {
    vault: {
      address: process.env.VAULT_ADDR || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN, // For dev only
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      secretsPath: process.env.VAULT_SECRETS_PATH || 'secret/data/saga-orchestrator-service',
    },
  },
};

export default config;
