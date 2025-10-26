/**
 * @fileoverview Centralized configuration for the Accounts microservice.
 * This file consolidates all environment-specific variables and settings,
 * making the application more portable and easier to manage across different
 * deployment environments (development, staging, production).
 *
 * It adheres to the 12-factor app methodology by strictly separating config
 * from code. All configuration values are loaded from environment variables.
 *
 * As per the architectural directives, this configuration supports a polyglot
 * persistence model (PostgreSQL for write/event store, Elasticsearch for read),
 * an event-driven backbone (Kafka), distributed caching (Redis), and a
 * Zero Trust security model (IAM/JWT, HashiCorp Vault).
 *
 * @version 1.0.0
 * @module config
 */

import dotenv from 'dotenv';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * @interface IServiceConfig
 * @description Defines the shape of the configuration object for the Accounts service.
 *              Provides strong typing for all environment-derived settings.
 */
export interface IServiceConfig {
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
   * @property {object} api - Configuration for the API layer.
   */
  api: {
    /**
     * @property {string} prefix - The global prefix for all API routes.
     * @example '/api/v1/accounts'
     */
    prefix: string;
  };

  /**
   * @property {object} eventStore - Configuration for the write-side (Command) database.
   *                                  Used for event sourcing persistence.
   */
  eventStore: {
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
     * @property {string} password - The password for the PostgreSQL database connection.
     *                               Should be retrieved from a secret manager like Vault.
     */
    password?: string;
    /**
     * @property {string} database - The name of the PostgreSQL database.
     */
    database: string;
  };

  /**
   * @property {object} readModel - Configuration for the read-side (Query) database.
   *                                Used for denormalized query projections.
   */
  readModel: {
    /**
     * @property {string} node - The URL of the Elasticsearch node.
     */
    node: string;
    /**
     * @property {string} username - The username for Elasticsearch connection.
     */
    username?: string;
    /**
     * @property {string} password - The password for Elasticsearch connection.
     */
    password?: string;
  };

  /**
   * @property {object} kafka - Configuration for the Apache Kafka event backbone.
   */
  kafka: {
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
     * @property {object} topics - A map of logical topic names to actual Kafka topic names.
     */
    topics: {
      /**
       * @property {string} accountEvents - The topic where account domain events are published.
       */
      accountEvents: string;
    };
  };

  /**
   * @property {object} cache - Configuration for the distributed caching layer (Redis).
   */
  cache: {
    /**
     * @property {string} host - The hostname of the Redis server.
     */
    host: string;
    /**
     * @property {number} port - The port number of the Redis server.
     */
    port: number;
    /**
     * @property {string} password - The password for the Redis server.
     */
    password?: string;
  };

  /**
   * @property {object} security - Configuration for the Zero Trust security model.
   */
  security: {
    /**
     * @property {object} jwt - JSON Web Token validation settings.
     */
    jwt: {
      /**
       * @property {string} issuer - The expected 'iss' claim in the JWT, pointing to the IAM service.
       */
      issuer: string;
      /**
       * @property {string} audience - The expected 'aud' claim in the JWT for this service.
       */
      audience: string;
      /**
       * @property {string} jwksUri - The URL to the JSON Web Key Set (JWKS) for verifying token signatures.
       */
      jwksUri: string;
    };
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
       * @example 'secret/data/accounts-service'
       */
      secretsPath: string;
    };
  };
}

/**
 * @const {IServiceConfig} config
 * @description The main configuration object, populated from environment variables.
 *              Provides default values for a development environment where appropriate.
 */
const config: IServiceConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.ACCOUNTS_SERVICE_PORT || '3001', 10),
  logLevel: process.env.LOG_LEVEL || 'info',

  api: {
    prefix: '/api/v1/accounts',
  },

  eventStore: {
    host: process.env.EVENT_STORE_DB_HOST || 'localhost',
    port: parseInt(process.env.EVENT_STORE_DB_PORT || '5432', 10),
    user: process.env.EVENT_STORE_DB_USER || 'accounts_user',
    password: process.env.EVENT_STORE_DB_PASSWORD, // Must be provided via env/secret manager
    database: process.env.EVENT_STORE_DB_NAME || 'accounts_event_store',
  },

  readModel: {
    node: process.env.READ_MODEL_DB_NODE || 'http://localhost:9200',
    username: process.env.READ_MODEL_DB_USER,
    password: process.env.READ_MODEL_DB_PASSWORD,
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: 'accounts-service',
    groupId: 'accounts-service-group',
    topics: {
      accountEvents: process.env.KAFKA_TOPIC_ACCOUNT_EVENTS || 'domain.accounts.events',
    },
  },

  cache: {
    host: process.env.CACHE_HOST || 'localhost',
    port: parseInt(process.env.CACHE_PORT || '6379', 10),
    password: process.env.CACHE_PASSWORD,
  },

  security: {
    jwt: {
      issuer: process.env.JWT_ISSUER || 'https://iam.platform.service',
      audience: process.env.JWT_AUDIENCE || 'accounts-service',
      jwksUri: process.env.JWT_JWKS_URI || 'https://iam.platform.service/.well-known/jwks.json',
    },
    vault: {
      address: process.env.VAULT_ADDR || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN, // For dev only
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      secretsPath: process.env.VAULT_SECRETS_PATH || 'secret/data/accounts-service',
    },
  },
};

export default config;
