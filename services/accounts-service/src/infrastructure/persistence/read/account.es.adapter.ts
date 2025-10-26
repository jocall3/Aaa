import { Client, estypes } from '@elastic/elasticsearch';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountReadModel } from '../../../domain/read-models/account.read-model';
import { AccountReadRepository } from '../../../application/ports/out/account.read.repository';
import { ELASTICSEARCH_CLIENT } from '../../elasticsearch/elasticsearch.constants';

/**
 * @class AccountElasticsearchAdapter
 * @implements {AccountReadRepository}
 * @description
 * This class is an adapter for the AccountReadRepository port. It provides the concrete
 * implementation for querying and persisting denormalized account read models using Elasticsearch.
 * As part of the infrastructure layer in a Hexagonal Architecture, it translates application
 * requests into Elasticsearch-specific operations.
 * This adapter is crucial for the Query side of the CQRS pattern, offering fast,
 * flexible querying capabilities for account data.
 */
@Injectable()
export class AccountElasticsearchAdapter implements AccountReadRepository {
  private readonly logger = new Logger(AccountElasticsearchAdapter.name);
  private readonly indexName = 'accounts_read_model';

  /**
   * @constructor
   * @param {Client} esClient - The injected Elasticsearch client instance.
   */
  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly esClient: Client,
  ) {
    this.ensureIndexExists();
  }

  /**
   * @private
   * @async
   * @method ensureIndexExists
   * @description Checks if the Elasticsearch index exists and creates it if it doesn't.
   * This is a basic setup and might be handled by a more robust migration/setup script in production.
   * Defines the mapping for the AccountReadModel.
   * @returns {Promise<void>}
   */
  private async ensureIndexExists(): Promise<void> {
    try {
      const { body: exists } = await this.esClient.indices.exists({ index: this.indexName });
      if (!exists) {
        this.logger.log(`Index '${this.indexName}' not found. Creating index...`);
        await this.esClient.indices.create({
          index: this.indexName,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                userId: { type: 'keyword' },
                balance: { type: 'double' },
                currency: { type: 'keyword' },
                accountType: { type: 'keyword' },
                status: { type: 'keyword' },
                createdAt: { type: 'date' },
                updatedAt: { type: 'date' },
                overdraftLimit: { type: 'double' },
                nickname: { type: 'text' },
              },
            },
          },
        });
        this.logger.log(`Index '${this.indexName}' created successfully.`);
      }
    } catch (error) {
      this.logger.error(`Error ensuring index '${this.indexName}' exists:`, error);
      // In a real application, this might be a fatal error that prevents startup.
      throw error;
    }
  }

  /**
   * @async
   * @method save
   * @description Saves or updates an account read model document in Elasticsearch.
   * It uses the account's ID as the document ID for idempotency.
   * This is typically called by an event handler projecting changes to the read model.
   * @param {AccountReadModel} account - The denormalized account data to persist.
   * @returns {Promise<void>}
   */
  async save(account: AccountReadModel): Promise<void> {
    this.logger.log(`Indexing account read model with ID: ${account.id}`);
    try {
      await this.esClient.index({
        index: this.indexName,
        id: account.id,
        body: account,
        refresh: 'wait_for', // Ensures the document is searchable immediately after indexing
      });
    } catch (error) {
      this.logger.error(`Failed to save account read model for ID ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * @async
   * @method findById
   * @description Retrieves a single account read model by its unique ID from Elasticsearch.
   * @param {string} id - The unique identifier of the account.
   * @returns {Promise<AccountReadModel | null>} The account read model if found, otherwise null.
   */
  async findById(id: string): Promise<AccountReadModel | null> {
    this.logger.log(`Finding account read model by ID: ${id}`);
    try {
      const response: estypes.GetResponse<AccountReadModel> = await this.esClient.get({
        index: this.indexName,
        id: id,
      });

      if (!response.found || !response._source) {
        return null;
      }
      return response._source;
    } catch (error: any) {
      if (error.statusCode === 404) {
        this.logger.warn(`Account read model with ID ${id} not found.`);
        return null;
      }
      this.logger.error(`Error finding account read model by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * @async
   * @method findByUserId
   * @description Finds all account read models associated with a given user ID.
   * @param {string} userId - The identifier of the user.
   * @returns {Promise<AccountReadModel[]>} An array of account read models.
   */
  async findByUserId(userId: string): Promise<AccountReadModel[]> {
    this.logger.log(`Finding account read models for user ID: ${userId}`);
    try {
      const response: estypes.SearchResponse<AccountReadModel> = await this.esClient.search({
        index: this.indexName,
        body: {
          query: {
            term: {
              'userId.keyword': userId, // Use .keyword for exact match on keyword fields
            },
          },
          size: 100, // Apply a reasonable default limit to prevent excessive data retrieval
        },
      });

      return response.hits.hits.map(hit => hit._source as AccountReadModel);
    } catch (error) {
      this.logger.error(`Error finding account read models by user ID ${userId}:`, error);
      throw error;
    }
  }
}
