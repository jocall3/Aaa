/**
 * @file account.es.adapter.ts
 * @description This file contains the Elasticsearch adapter for the Account read repository.
 * It implements the IAccountReadRepository port and provides the persistence logic
 * for the denormalized AccountReadModel, used on the query side of the CQRS pattern.
 * This implementation adheres to the new Generic Repository and Data Mapper patterns.
 *
 * @see /docs/adr/ADR-005-generic-repository-and-error-handling.md
 * @author Elite AI Implementation Team
 * @version 2.0.0
 */

import { Client, estypes } from '@elastic/elasticsearch';
import { Inject, Injectable, Logger } from '@nestjs/common';

// Fictional imports for new architectural patterns. In a real scenario, these would come from shared libraries.
import { GenericDataMapper } from '../../../../../../libs/persistence/generic.data-mapper'; // Fictional path
import { InfrastructureError } from '../../../../../../libs/error-framework/infrastructure.error'; // Fictional path

import { IAccountReadRepository } from '../../../application/ports/account-read.repository';
import { AccountReadModel } from '../../../domain/read-models/account.read-model';
import { ELASTICSEARCH_CLIENT } from '../../common/elasticsearch.constants';

// --- Persistence & Mapping Layer ---
// NOTE: For clarity, these are included here. In a complete implementation,
// they would reside in separate files (e.g., account.es.persistence.ts, account.es.mapper.ts).

/**
 * @interface AccountEsPersistence
 * @description Represents the data structure of an account document as stored in Elasticsearch.
 * This is the "Persistence" model in the GenericDataMapper pattern.
 * @internal
 */
interface AccountEsPersistence {
  accountId: string;
  customerId: string;
  userIds: string[];
  accountStatus: string;
  currentBalance: number;
  currencyCode: string;
  createdAt: string; // ISO8601 string
  updatedAt: string; // ISO8601 string
  // Other fields from the mapping would be included here.
}

/**
 * @class AccountEsMapper
 * @implements GenericDataMapper<AccountReadModel, AccountEsPersistence>
 * @description A stateless utility class for mapping between the domain's AccountReadModel
 * and the persistence layer's AccountEsPersistence document. This follows the Data Mapper pattern.
 */
class AccountEsMapper implements GenericDataMapper<AccountReadModel, AccountEsPersistence> {
  /**
   * @public
   * @method toDomain
   * @description Maps from the persistence model (Elasticsearch document) to the domain read model.
   * @param {AccountEsPersistence} persistence The raw document from Elasticsearch.
   * @returns {AccountReadModel} The domain-layer read model.
   */
  public toDomain(persistence: AccountEsPersistence): AccountReadModel {
    return {
      id: persistence.accountId,
      userId: persistence.customerId,
      balance: persistence.currentBalance,
      currency: persistence.currencyCode,
      status: persistence.accountStatus,
      createdAt: new Date(persistence.createdAt),
      updatedAt: new Date(persistence.updatedAt),
    };
  }

  /**
   * @public
   * @method toPersistence
   * @description Maps from the domain read model to the persistence model (Elasticsearch document).
   * @param {AccountReadModel} domain The domain-layer read model.
   * @returns {AccountEsPersistence} The document to be stored in Elasticsearch.
   */
  public toPersistence(domain: AccountReadModel): AccountEsPersistence {
    return {
      accountId: domain.id,
      customerId: domain.userId,
      userIds: [domain.userId], // Example transformation
      currentBalance: domain.balance,
      currencyCode: domain.currency,
      accountStatus: domain.status,
      createdAt: domain.createdAt.toISOString(),
      updatedAt: domain.updatedAt.toISOString(),
    };
  }
}

/**
 * @class AccountElasticsearchAdapter
 * @implements {IAccountReadRepository}
 * @description
 * This class is the concrete implementation of the IAccountReadRepository port for Elasticsearch.
 * It acts as a persistence adapter in the infrastructure layer, abstracting all Elasticsearch-specific
 * logic from the application's core. It uses a Data Mapper to translate between domain and
 * persistence models, fulfilling the Generic Repository and Data Mapper architectural directives.
 */
@Injectable()
export class AccountElasticsearchAdapter implements IAccountReadRepository {
  private readonly logger = new Logger(AccountElasticsearchAdapter.name);
  private readonly indexName = 'accounts_read_model';
  private readonly mapper: AccountEsMapper = new AccountEsMapper();

  /**
   * @constructor
   * @param {Client} esClient The injected Elasticsearch client instance.
   */
  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly esClient: Client,
  ) {
    this.ensureIndexExists().catch(error => {
      this.logger.error(`Fatal error ensuring index '${this.indexName}' exists. The service may not function correctly.`, error);
      // In a production app, this might trigger a process exit or health check failure.
    });
  }

  /**
   * @public
   * @async
   * @method save
   * @description Saves (indexes or updates) a denormalized account read model in Elasticsearch.
   * This is typically called by a projection handler reacting to domain events.
   * @param {AccountReadModel} account The domain read model to save.
   * @returns {Promise<void>}
   * @throws {InfrastructureError} If the Elasticsearch operation fails.
   */
  public async save(account: AccountReadModel): Promise<void> {
    this.logger.log(`Indexing account read model with ID: ${account.id}`);
    try {
      const document = this.mapper.toPersistence(account);
      await this.esClient.index({
        index: this.indexName,
        id: account.id,
        body: document,
        refresh: process.env.NODE_ENV === 'test' ? 'wait_for' : false,
      });
    } catch (error) {
      this.logger.error(`Failed to save account read model for ID ${account.id}.`, error.stack);
      throw new InfrastructureError(`Failed to save account read model for ID ${account.id}.`, { cause: error });
    }
  }

  /**
   * @public
   * @async
   * @method findById
   * @description Retrieves a single account read model by its unique ID from Elasticsearch.
   * @param {string} id The unique identifier of the account.
   * @returns {Promise<AccountReadModel | null>} The account read model if found, otherwise null.
   * @throws {InfrastructureError} If the Elasticsearch operation fails for reasons other than not found.
   */
  public async findById(id: string): Promise<AccountReadModel | null> {
    this.logger.log(`Finding account read model by ID: ${id}`);
    try {
      const response: estypes.GetResponse<AccountEsPersistence> = await this.esClient.get({
        index: this.indexName,
        id: id,
      });

      if (!response.found || !response._source) {
        return null;
      }
      return this.mapper.toDomain(response._source);
    } catch (error: any) {
      if (error.meta?.statusCode === 404) {
        this.logger.warn(`Account read model with ID ${id} not found.`);
        return null;
      }
      this.logger.error(`Error finding account read model by ID ${id}.`, error.stack);
      throw new InfrastructureError(`Error finding account read model by ID ${id}.`, { cause: error });
    }
  }

  /**
   * @public
   * @async
   * @method findByUserId
   * @description Finds all account read models associated with a given user ID.
   * @param {string} userId The identifier of the user.
   * @returns {Promise<AccountReadModel[]>} An array of account read models, which may be empty.
   * @throws {InfrastructureError} If the Elasticsearch operation fails.
   */
  public async findByUserId(userId: string): Promise<AccountReadModel[]> {
    this.logger.log(`Finding account read models for user ID: ${userId}`);
    try {
      const response: estypes.SearchResponse<AccountEsPersistence> = await this.esClient.search({
        index: this.indexName,
        body: {
          query: {
            term: {
              customerId: userId, // Corresponds to the 'keyword' field in the mapping.
            },
          },
          size: 100, // A sensible default limit
        },
      });

      if (!response.hits.hits || response.hits.hits.length === 0) {
        return [];
      }
      return response.hits.hits.map(hit => this.mapper.toDomain(hit._source as AccountEsPersistence));
    } catch (error) {
      this.logger.error(`Error finding account read models by user ID ${userId}.`, error.stack);
      throw new InfrastructureError(`Error finding account read models by user ID ${userId}.`, { cause: error });
    }
  }

  /**
   * @private
   * @async
   * @method ensureIndexExists
   * @description Checks if the target Elasticsearch index exists on startup, and creates it if not.
   * The mapping is derived from the centralized 'account-read-model.mapping.json' file.
   * In production, a more robust index lifecycle management tool would be used.
   * @returns {Promise<void>}
   */
  private async ensureIndexExists(): Promise<void> {
    const { body: exists } = await this.esClient.indices.exists({ index: this.indexName });
    if (exists) {
      this.logger.log(`Index '${this.indexName}' already exists.`);
      return;
    }

    this.logger.log(`Index '${this.indexName}' not found. Creating index...`);
    try {
      await this.esClient.indices.create({
        index: this.indexName,
        body: {
          mappings: {
            // This is a subset of the mapping from account-read-model.mapping.json
            // for illustrative purposes. A real implementation might load the JSON file.
            dynamic: 'strict',
            properties: {
              accountId: { type: 'keyword' },
              customerId: { type: 'keyword' },
              userIds: { type: 'keyword' },
              accountStatus: { type: 'keyword' },
              currencyCode: { type: 'keyword' },
              currentBalance: { type: 'scaled_float', scaling_factor: 100 },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });
      this.logger.log(`Index '${this.indexName}' created successfully.`);
    } catch (error) {
      this.logger.error(`Error creating index '${this.indexName}'.`, error);
      throw error; // Propagate error on startup
    }
  }
}
