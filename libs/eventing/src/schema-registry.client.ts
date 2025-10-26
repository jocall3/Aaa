/**
 * @file schema-registry.client.ts
 * @description This file contains a client for interacting with a Confluent-compatible Schema Registry.
 *
 * @module Eventing/SchemaRegistryClient
 *
 * @see ADR-002: Introduce an Abstracted Event Bus with a Centralized Schema Registry.
 *
 * @summary
 * This client provides a typed interface for common schema registry operations, including
 * fetching schemas by ID or subject, and registering new schemas. It includes in-memory
 * caching to optimize performance and reduce network calls.
 */

import axios, { AxiosInstance } from 'axios';
// Per architectural directives, a shared logger and error framework should be used.
// import { ILogger } from '@shared/logger';
// import { InfrastructureError, NotFoundError } from '@shared/error-framework';

/**
 * @interface SchemaRegistryClientConfig
 * @description Configuration for the SchemaRegistryClient.
 * @property {string} baseUrl - The base URL of the Schema Registry API (e.g., 'http://schema-registry:8081').
 */
export interface SchemaRegistryClientConfig {
  baseUrl: string;
  // logger?: ILogger; // A shared logger would be injected here.
}

/**
 * @interface SchemaResponse
 * @description Represents the shape of a schema response from the registry.
 */
interface SchemaResponse {
  schema: string;
  id: number;
  version: number;
  subject: string;
}

/**
 * @interface RegisterSchemaRequest
 * @description Represents the payload for registering a new schema.
 */
interface RegisterSchemaRequest {
  schema: string;
  schemaType?: 'AVRO' | 'PROTOBUF' | 'JSON';
}

/**
 * @interface RegisterSchemaResponse
 * @description Represents the successful response from a schema registration request.
 */
interface RegisterSchemaResponse {
  id: number;
}

/**
 * @interface FindSchemaResponse
 * @description Represents the successful response when checking for an existing schema.
 */
interface FindSchemaResponse extends SchemaResponse {}

/**
 * @class SchemaRegistryClient
 * @description A client for interacting with a Confluent Schema Registry. It handles
 * fetching, registering, and caching schemas.
 *
 * @example
 * ```ts
 * const client = new SchemaRegistryClient({ baseUrl: 'http://localhost:8081' });
 * const { id, schema } = await client.getLatestSchema('my-topic-value');
 * console.log(`Latest schema ID is ${id}`);
 * ```
 */
export class SchemaRegistryClient {
  private readonly client: AxiosInstance;
  // private readonly logger: ILogger;

  // Caches to reduce network traffic to the schema registry
  private readonly schemaByIdCache = new Map<number, string>();
  private readonly idBySubjectSchemaCache = new Map<string, number>();

  /**
   * @constructor
   * @param {SchemaRegistryClientConfig} config - The configuration for the client.
   */
  constructor(config: SchemaRegistryClientConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/vnd.schemaregistry.v1+json',
        'Accept': 'application/vnd.schemaregistry.v1+json',
      },
    });
    // this.logger = config.logger ?? new ConsoleLogger(); // Use a default or injected logger
  }

  /**
   * Fetches a schema definition string by its unique global ID.
   *
   * @public
   * @async
   * @param {number} id - The unique identifier of the schema.
   * @returns {Promise<string>} A promise that resolves to the schema definition string.
   * @throws {Error} If the request to the schema registry fails. Per ADRs, this should be a cataloged `InfrastructureError` or `NotFoundError`.
   */
  public async getSchemaById(id: number): Promise<string> {
    if (this.schemaByIdCache.has(id)) {
      return this.schemaByIdCache.get(id)!;
    }

    try {
      const response = await this.client.get<{ schema: string }>(`/schemas/ids/${id}`);
      const schema = response.data.schema;
      this.schemaByIdCache.set(id, schema);
      return schema;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Schema with ID ${id} not found.`);
      }
      throw new Error(`Failed to fetch schema with ID ${id}: ${error.message}`);
    }
  }

  /**
   * Retrieves the latest version of a schema for a given subject.
   *
   * @public
   * @async
   * @param {string} subject - The subject name (e.g., 'topic-name-value').
   * @returns {Promise<SchemaResponse>} A promise that resolves to an object containing the latest schema, its ID, version, and subject.
   * @throws {Error} If the request fails. Per ADRs, this should be a cataloged `InfrastructureError` or `NotFoundError`.
   */
  public async getLatestSchema(subject: string): Promise<SchemaResponse> {
    return this.getSchemaBySubjectAndVersion(subject, 'latest');
  }

  /**
   * Retrieves a specific version of a schema for a given subject.
   *
   * @public
   * @async
   * @param {string} subject - The subject name (e.g., 'topic-name-value').
   * @param {number | 'latest'} version - The version number of the schema or the literal 'latest'.
   * @returns {Promise<SchemaResponse>} A promise that resolves to an object containing the schema, its ID, version, and subject.
   * @throws {Error} If the request fails. Per ADRs, this should be a cataloged `InfrastructureError` or `NotFoundError`.
   */
  public async getSchemaBySubjectAndVersion(
    subject: string,
    version: number | 'latest',
  ): Promise<SchemaResponse> {
    try {
      const response = await this.client.get<SchemaResponse>(
        `/subjects/${subject}/versions/${version}`,
      );
      
      this.schemaByIdCache.set(response.data.id, response.data.schema);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Schema for subject "${subject}" version "${version}" not found.`);
      }
      throw new Error(`Failed to fetch schema for subject "${subject}" version "${version}": ${error.message}`);
    }
  }

  /**
   * Registers a new schema version under a subject. If the schema is identical to an existing
   * version, it returns the ID of that version. If it's a new schema, it creates a new
   * version and returns its new ID.
   *
   * @public
   * @async
   * @param {string} subject - The subject under which to register the schema.
   * @param {string | object} schema - The schema definition, as a JSON string or a plain object.
   * @param {('AVRO' | 'PROTOBUF' | 'JSON')} [schemaType='AVRO'] - The type of the schema.
   * @returns {Promise<number>} A promise that resolves to the unique global ID of the schema.
   * @throws {Error} If the request fails or the schema is invalid/incompatible. Per ADRs, this should be a cataloged `InfrastructureError` or `ValidationError`.
   */
  public async registerSchema(
    subject: string,
    schema: string | object,
    schemaType: 'AVRO' | 'PROTOBUF' | 'JSON' = 'AVRO',
  ): Promise<number> {
    const schemaString = typeof schema === 'string' ? schema : JSON.stringify(schema);
    const cacheKey = `${subject}:${schemaString}`;

    if (this.idBySubjectSchemaCache.has(cacheKey)) {
        return this.idBySubjectSchemaCache.get(cacheKey)!;
    }

    try {
      const payload: RegisterSchemaRequest = {
        schema: schemaString,
        schemaType,
      };

      const response = await this.client.post<RegisterSchemaResponse>(
        `/subjects/${subject}/versions`,
        payload,
      );

      const { id } = response.data;
      this.idBySubjectSchemaCache.set(cacheKey, id);
      this.schemaByIdCache.set(id, schemaString);

      return id;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorMessage = error.response.data.message;
        if (error.response.status === 409) { // Incompatible schema
            throw new Error(`Schema for subject "${subject}" is incompatible with previous versions. Registry error: ${errorMessage}`);
        }
        if (error.response.status === 422) { // Invalid schema
            throw new Error(`Invalid schema for subject "${subject}". Registry error: ${errorMessage}`);
        }
      }
      throw new Error(`Failed to register schema for subject "${subject}": ${error.message}`);
    }
  }

   /**
   * Checks if a schema has already been registered for a subject and, if so, returns its ID and version.
   * This is useful for avoiding registration calls if the schema is already present.
   *
   * @public
   * @async
   * @param {string} subject - The subject name.
   * @param {string | object} schema - The schema definition to check.
   * @param {('AVRO' | 'PROTOBUF' | 'JSON')} [schemaType='AVRO'] - The type of the schema.
   * @returns {Promise<{ id: number; version: number } | null>} A promise resolving to the schema's ID and version if found, otherwise null.
   * @throws {Error} If the request to the schema registry fails for reasons other than not being found. Per ADRs, this should be a cataloged `InfrastructureError`.
   */
  public async lookupSchema(
    subject: string,
    schema: string | object,
    schemaType: 'AVRO' | 'PROTOBUF' | 'JSON' = 'AVRO',
  ): Promise<{ id: number; version: number } | null> {
    const schemaString = typeof schema === 'string' ? schema : JSON.stringify(schema);

    try {
      const payload: RegisterSchemaRequest = {
        schema: schemaString,
        schemaType,
      };
      
      const response = await this.client.post<FindSchemaResponse>(
        `/subjects/${subject}`,
        payload,
      );

      const { id, version } = response.data;
      
      // Populate caches
      this.idBySubjectSchemaCache.set(`${subject}:${schemaString}`, id);
      this.schemaByIdCache.set(id, schemaString);

      return { id, version };
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            // 404 is the expected response when the schema is not found for this endpoint.
            return null;
        }
        // Re-throw other errors
        throw new Error(`Failed to lookup schema for subject "${subject}": ${error.message}`);
    }
  }
}
