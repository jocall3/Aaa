import { IResolvers } from '@graphql-tools/utils';
import DataLoader from 'dataloader';
import { GraphQLContext } from './context';
import {
  Account,
  Transaction,
  InitiatePaymentInput,
  PaymentResponse,
  QueryAccountArgs,
} from './__generated__/graphql';
import { NotFoundError, ValidationError } from '@shared/error-framework';

/**
 * @fileoverview GraphQL Resolvers for the WebApp BFF.
 * @description
 * This file implements the resolver functions for the GraphQL schema. As per the
 * BFF (Backend-for-Frontend) architectural directive, these resolvers are responsible for:
 * 1. Orchestrating and composing data from various downstream microservices (e.g., accounts-service, payments-service).
 * 2. Utilizing DataLoader to batch requests and mitigate the N+1 query problem.
 * 3. Propagating authentication context to downstream services.
 * 4. Throwing standardized errors from the shared error-framework.
 *
 * Every resolver is fully documented to comply with the 100% docs-as-code mandate.
 *
 * @see /docs/adr/ADR-003-graphql-bff.md
 * @see /docs/adr/ADR-008-caching-strategy.md
 * @module WebAppBFF/Resolvers
 */

/**
 * @interface DataLoaders
 * @description Defines the shape of the data loaders available on the GraphQL context for each request.
 *              These loaders batch and cache requests within a single GraphQL operation.
 * @property {DataLoader<string, Account | null>} accountById - Batches fetching accounts by their IDs.
 * @property {DataLoader<string, Transaction[]>} transactionsByAccountId - Batches fetching transactions for a set of account IDs.
 */
export interface DataLoaders {
  accountById: DataLoader<string, Account | null>;
  transactionsByAccountId: DataLoader<string, Transaction[]>;
}

/**
 * Creates and returns a new set of DataLoaders for a single request.
 * This function is called for each incoming GraphQL request to ensure that caching
 * is scoped correctly and doesn't leak between requests or users.
 *
 * @param {GraphQLContext['dataSources']} dataSources - The data source clients for downstream services.
 * @returns {DataLoaders} An object containing instantiated DataLoaders.
 * @example
 * // In the server setup:
 * const server = new ApolloServer({
 *   resolvers,
 *   context: ({ req }) => ({
 *     // ... other context properties
 *     loaders: createDataLoaders(dataSources),
 *   }),
 * });
 */
export const createDataLoaders = (dataSources: GraphQLContext['dataSources']): DataLoaders => ({
  accountById: new DataLoader<string, Account | null>(
    async (ids) => {
      // The data source method `getAccountsByIds` would make a single batch request
      // to the accounts-service, e.g., GET /accounts?ids=id1,id2,id3
      const accounts = await dataSources.accountsAPI.getAccountsByIds(ids as string[]);
      // The loader requires the returned array to be in the same order as the input IDs.
      const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));
      return ids.map((id) => accountMap.get(id) || null);
    },
    { cacheKeyFn: (key) => key.toString() }
  ),

  transactionsByAccountId: new DataLoader<string, Transaction[]>(
    async (accountIds) => {
      // The data source method `getTransactionsForAccounts` would make a single batch request,
      // possibly to a dedicated endpoint like POST /transactions/batch-lookup
      const transactionsByAccount = await dataSources.accountsAPI.getTransactionsForAccounts(accountIds as string[]);
      // The loader requires the returned array to be in the same order as the input IDs.
      const transactionsMap = new Map(Object.entries(transactionsByAccount));
      return accountIds.map((id) => transactionsMap.get(id) || []);
    },
    { cacheKeyFn: (key) => key.toString() }
  ),
});

/**
 * @const {IResolvers<any, GraphQLContext>} resolvers
 * @description The main GraphQL resolver map object. It connects schema fields and types to
 *              the functions that fetch and return the data for them.
 */
export const resolvers: IResolvers<any, GraphQLContext> = {
  Query: {
    /**
     * @resolver
     * @description Fetches the profile of the currently authenticated user.
     *              In this architecture, this might involve fetching details from the IAM service
     *              or simply returning data decoded from the JWT.
     * @param _ - The parent object, which is null for root-level queries.
     * @param __ - The arguments for this query (none in this case).
     * @param {GraphQLContext} context - The GraphQL context object, containing auth info and data sources.
     * @returns {Promise<any>} A promise that resolves to the user's profile.
     * @throws {NotFoundError} If the user identified in the context cannot be found.
     * @example
     * query GetMyProfile {
     *   me {
     *     id
     *     username
     *     firstName
     *   }
     * }
     */
    me: async (_, __, { userId, dataSources }) => {
      // Assuming dataSources.iamAPI exists to enrich user data
      const user = await dataSources.iamAPI.getUserById(userId);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found.`, 'USER_NOT_FOUND');
      }
      return user;
    },

    /**
     * @resolver
     * @description Retrieves a list of all bank accounts associated with the authenticated user.
     * @param _ - The parent object.
     * @param __ - The arguments for this query.
     * @param {GraphQLContext} context - The GraphQL context, containing the user ID and data sources.
     * @returns {Promise<Account[]>} A promise that resolves to an array of accounts.
     * @example
     * query GetMyAccounts {
     *   accounts {
     *     id
     *     accountType
     *     balance
     *     currency
     *   }
     * }
     */
    accounts: async (_, __, { userId, dataSources }) => {
      return dataSources.accountsAPI.getAccountsByUserId(userId);
    },

    /**
     * @resolver
     * @description Fetches a single bank account by its unique ID.
     * @param _ - The parent object.
     * @param {QueryAccountArgs} args - The arguments for this query, containing the account ID.
     * @param {GraphQLContext} context - The GraphQL context, containing data loaders.
     * @returns {Promise<Account | null>} A promise that resolves to the account or null if not found.
     * @throws {NotFoundError} If the account does not exist.
     * @throws {AuthorizationError} If the user is not authorized to view the account.
     * @example
     * query GetAccountDetails($accountId: ID!) {
     *   account(id: $accountId) {
     *     id
     *     productName
     *     balance
     *     transactions(limit: 5) {
     *       id
     *       amount
     *       description
     *     }
     *   }
     * }
     */
    account: async (_, { id }: QueryAccountArgs, { loaders, dataSources, userId }) => {
      // Authorization check happens first, as per centralized policy enforcement.
      await dataSources.authzAPI.check(userId, 'view', `account:${id}`);
      
      const account = await loaders.accountById.load(id);
      if (!account) {
        throw new NotFoundError(`Account with ID ${id} not found.`, 'ACCOUNT_NOT_FOUND');
      }
      return account;
    },
  },

  Mutation: {
    /**
     * @resolver
     * @description Initiates a payment from a source account to a destination account. This is an
     *              asynchronous operation that triggers a Saga orchestration flow.
     * @param _ - The parent object.
     * @param {object} args - The mutation arguments.
     * @param {InitiatePaymentInput} args.input - The payment details.
     * @param {GraphQLContext} context - The GraphQL context.
     * @returns {Promise<PaymentResponse>} A response object indicating the payment has been initiated.
     * @throws {ValidationError} If the input data is invalid.
     * @throws {AuthorizationError} If the user is not permitted to transfer from the source account.
     * @example
     * mutation StartPayment {
     *   initiatePayment(input: {
     *     sourceAccountId: "acc-123",
     *     destinationAccountId: "acc-456",
     *     amount: 100.50,
     *     currency: "USD",
     *     idempotencyKey: "unique-key-for-this-payment"
     *   }) {
     *     paymentId
     *     status
     *   }
     * }
     */
    initiatePayment: async (_, { input }: { input: InitiatePaymentInput }, { dataSources, userId }): Promise<PaymentResponse> => {
      if (input.amount <= 0) {
        throw new ValidationError('Payment amount must be positive.', 'INVALID_AMOUNT');
      }

      // Authorization check against the source account
      await dataSources.authzAPI.check(userId, 'transfer_from', `account:${input.sourceAccountId}`);

      // Delegate to the payments-service data source, which will call the downstream API.
      // The user ID from the context is passed for auditing and ownership.
      const paymentResponse = await dataSources.paymentsAPI.initiatePayment({
        ...input,
        userId,
      });

      return paymentResponse;
    },
  },

  // Field Resolvers to handle relationships between types
  Account: {
    /**
     * @resolver
     * @description Fetches the transaction history for a specific account. This resolver uses a
     *              DataLoader to batch requests for transactions across multiple accounts in a single query.
     * @param {Account} parentAccount - The parent account object for which to fetch transactions.
     * @param {{ limit?: number }} args - Arguments to limit the number of transactions returned.
     * @param {GraphQLContext} context - The GraphQL context, containing the data loaders.
     * @returns {Promise<Transaction[]>} A promise resolving to the account's transactions.
     */
    transactions: async (parentAccount: Account, { limit }: { limit?: number }, { loaders }): Promise<Transaction[]> => {
      // The parent resolver for `account` already performed the authorization check.
      const allTransactions = await loaders.transactionsByAccountId.load(parentAccount.id);
      return limit ? allTransactions.slice(0, limit) : allTransactions;
    },
  },
};
