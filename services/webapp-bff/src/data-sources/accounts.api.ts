import { RESTDataSource } from '@apollo/datasource-rest';
import type { AugmentedRequest } from '@apollo/datasource-rest';
import DataLoader from 'dataloader';

/**
 * @file accounts.api.ts
 * @description This file defines the GraphQL DataSource for interacting with the downstream Accounts microservice.
 *
 * @class AccountsAPI
 * @extends RESTDataSource
 *
 * @summary
 * The AccountsAPI class encapsulates all data fetching logic related to the accounts-service.
 * It handles RESTful API calls, authentication context propagation, caching, and error handling,
 * providing a clean, reusable interface for GraphQL resolvers.
 *
 * @architectural-decision
 * This class implements the Data Source pattern, a key part of the Backend-for-Frontend (BFF) architecture.
 * It abstracts the downstream REST microservice, making the GraphQL layer unaware of the underlying
 * data source's implementation details.
 *
 * Caching is implemented according to the "Multi-Layer Caching Strategy" directive. `RESTDataSource`
 * provides built-in, per-request memoization and can be configured with a shared distributed cache like Redis.
 *
 * The `willSendRequest` method centrally handles authentication context propagation, adhering to the
 * "Centralize Authorization with an External Policy Enforcement Service" directive.
 *
 * A DataLoader is used to prevent the N+1 query problem for fetching individual accounts, a key pattern
 * mentioned in the BFF and Caching architectural directives.
 *
 * @see ADR-003: "Implement a GraphQL-Based Backend-for-Frontend (BFF) Layer"
 * @see ADR-008: "Establish a Multi-Layer Caching Strategy"
 * @module WebAppBFF/DataSources/AccountsAPI
 */

/**
 * @interface Money
 * @description Represents a monetary amount and its currency from the accounts-service.
 */
interface Money {
  /** The monetary amount as a string to ensure precision. */
  amount: string;
  /** The ISO 4217 currency code. */
  currency: string;
}

/**
 * @interface Account
 * @description Represents the data shape of an account from the accounts-service.
 */
export interface Account {
  /** The unique identifier for the account. */
  accountId: string;
  /** The unique identifier for the user who owns the account. */
  userId: string;
  /** The type of the bank account. */
  accountType: 'CHECKING' | 'SAVINGS';
  /** The current status of the account. */
  status: 'OPEN' | 'CLOSED' | 'FROZEN';
  /** The current balance of the account. */
  balance: Money;
  /** A user-defined nickname for the account. */
  nickname?: string;
  /** The timestamp when the account was created. */
  createdAt: string;
  /** The timestamp when the account was last updated. */
  updatedAt: string;
}

/**
 * @interface Transaction
 * @description Represents the data shape of a single financial transaction from the accounts-service.
 */
export interface Transaction {
  /** The unique identifier for the transaction. */
  transactionId: string;
  /** The identifier of the account to which this transaction belongs. */
  accountId: string;
  /** The type of transaction. */
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  /** The monetary amount of the transaction. */
  amount: Money;
  /** A short description of the transaction. */
  description: string;
  /** The timestamp when the transaction occurred. */
  timestamp: string;
  /** The current status of the transaction. */
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

/**
 * @interface GraphQLContext
 * @description Defines the shape of the GraphQL context object available to all resolvers and data sources.
 */
export interface GraphQLContext {
  /** The JWT authentication token for the current user. */
  token?: string;
}

export class AccountsAPI extends RESTDataSource {
  /**
   * The base URL for the downstream accounts-service.
   * This is loaded from environment variables for configuration flexibility.
   *
   * @override
   * @type {string}
   */
  override baseURL = process.env.ACCOUNTS_SERVICE_URL || 'http://accounts-service/api/v1/';

  // Use a WeakMap to cache DataLoader instances per request context.
  // This ensures that for a single GraphQL operation, we use the same DataLoader instance,
  // but different operations get their own, preventing data leakage between requests.
  private accountLoader = new WeakMap<GraphQLContext, DataLoader<string, Account | Error>>();

  /**
   * An Apollo hook that is called before every outgoing request.
   * It is used here to propagate the user's authentication token to the downstream service,
   * fulfilling a key requirement of the BFF and central authorization patterns.
   *
   * @override
   * @protected
   * @param {string} path - The path of the request being sent.
   * @param {AugmentedRequest} request - The request object, which can be modified.
   * @returns {Promise<void>}
   */
  protected override async willSendRequest(
    path: string,
    request: AugmentedRequest,
  ): Promise<void> {
    const { token } = this.context as GraphQLContext;
    if (token) {
      request.headers['authorization'] = token;
    }
  }

  /**
   * Retrieves or creates a request-scoped DataLoader for fetching accounts by ID.
   * This is the heart of the N+1 batching strategy.
   *
   * @private
   * @returns {DataLoader<string, Account | Error>} The request-scoped DataLoader instance.
   */
  private getAccountLoader(): DataLoader<string, Account | Error> {
    const context = this.context as GraphQLContext;
    if (!this.accountLoader.has(context)) {
      this.accountLoader.set(
        context,
        new DataLoader<string, Account | Error>(async (ids) => {
          // The downstream service doesn't have a batch endpoint, so we make parallel requests.
          // RESTDataSource's built-in caching will still deduplicate calls for the same ID.
          const results = await Promise.all(
            ids.map((id) =>
              this.get<Account>(`accounts/${id}`).catch((error) => {
                // If a specific fetch fails (e.g., 404), return an Error object.
                // DataLoader requires an array of the same length as the input keys.
                return error;
              }),
            ),
          );
          return results;
        }),
      );
    }
    return this.accountLoader.get(context)!;
  }

  /**
   * Fetches a list of all accounts for the authenticated user.
   *
   * @public
   * @async
   * @returns {Promise<Account[]>} A promise that resolves to an array of accounts.
   * @example
   * resolvers: {
   *   Query: {
   *     accounts: (_, __, { dataSources }) => dataSources.accountsAPI.getAllAccounts(),
   *   }
   * }
   */
  async getAllAccounts(): Promise<Account[]> {
    return this.get<Account[]>('accounts', {
      cacheOptions: { ttl: 60 }, // Cache this list for 60 seconds
    });
  }

  /**
   * Fetches a single account by its unique identifier using a DataLoader.
   * This method is designed to be called many times within a single GraphQL request
   * without causing a surge of requests to the downstream service.
   *
   * @public
   * @async
   * @param {string} id - The unique identifier of the account.
   * @returns {Promise<Account | null>} A promise resolving to the account, or null if not found.
   * @example
   * resolvers: {
   *   User: {
   *     account: (user, { accountId }, { dataSources }) => dataSources.accountsAPI.getAccountById(accountId),
   *   }
   * }
   */
  async getAccountById(id: string): Promise<Account | null> {
    const result = await this.getAccountLoader().load(id);
    if (result instanceof Error) {
      // Log the actual error if necessary, but return null to the GraphQL layer for not found.
      console.error(`DataLoader error for account ID ${id}:`, result);
      return null;
    }
    return result;
  }

  /**
   * Fetches a list of transactions for a specific account, with optional filtering.
   *
   * @public
   * @async
   * @param {object} args - The arguments for fetching transactions.
   * @param {string} args.accountId - The ID of the account for which to fetch transactions.
   * @param {string} [args.fromDate] - The start date for the query range (ISO 8601 format).
   * @param {string} [args.toDate] - The end date for the query range (ISO 8601 format).
   * @param {number} [args.limit=50] - The maximum number of transactions to return.
   * @returns {Promise<Transaction[]>} A promise that resolves to an array of transactions.
   * @example
   * resolvers: {
   *   Account: {
   *     transactions: (account, args, { dataSources }) => 
   *       dataSources.accountsAPI.getTransactionsForAccount({ accountId: account.id, ...args }),
   *   }
   * }
   */
  async getTransactionsForAccount({
    accountId,
    fromDate,
    toDate,
    limit = 50,
  }: {
    accountId: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<Transaction[]> {
    const params: Record<string, string | number> = { limit };
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;

    return this.get<Transaction[]>(`accounts/${accountId}/transactions`, {
      params,
      cacheOptions: { ttl: 300 }, // Cache transactions for 5 minutes
    });
  }
}
