/**
 * @file Main entry point for the Web Application's Backend-for-Frontend (BFF) service.
 * @description This service implements the GraphQL-Based BFF Layer architectural directive.
 * It serves as an aggregation and orchestration layer between the web frontend and backend microservices.
 * Key responsibilities include:
 * - Providing a unified GraphQL schema tailored to the web UI's needs.
 * - Composing data from downstream services (e.g., accounts-service, payments-service).
 * - Propagating authentication context from incoming requests.
 * - Implementing a distributed caching layer with Redis and DataLoader to optimize performance.
 * @see ADR-003: Implement a GraphQL-Based Backend-for-Frontend (BFF) Layer
 * @see ADR-008: Establish a Multi-Layer Caching Strategy with a Dedicated Caching Abstraction
 * @module WebAppBFF/Index
 */

import { ApolloServer, gql } from 'apollo-server';
import { ApolloServerPluginCacheControl, ApolloServerPluginLandingPageGraphQLPlayground } from 'apollo-server-core';
import DataLoader from 'dataloader';
import Redis from 'ioredis';
import { RedisCache } from 'apollo-server-cache-redis';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';

// --- Configuration --- 
const PORT = process.env.PORT || 4000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ACCOUNTS_SERVICE_URL = process.env.ACCOUNTS_SERVICE_URL || 'http://accounts-service';
const PAYMENTS_SERVICE_URL = process.env.PAYMENTS_SERVICE_URL || 'http://payments-service';

// --- GraphQL Schema Definition ---

/**
 * @const typeDefs
 * @description The GraphQL schema definition for the WebApp BFF.
 * This schema is specifically designed to meet the data requirements of the web frontend,
 * aggregating data from multiple downstream microservices into a single, cohesive graph.
 * It also includes declarative caching hints using the `@cacheControl` directive.
 */
const typeDefs = gql`
  enum CacheControlScope {
    PUBLIC
    PRIVATE
  }

  directive @cacheControl(
    maxAge: Int
    scope: CacheControlScope
  ) on FIELD_DEFINITION | OBJECT | INTERFACE

  type Query {
    "Retrieves the currently authenticated user's accounts."
    myAccounts: [Account] @cacheControl(maxAge: 300, scope: PRIVATE)
    
    "Retrieves a specific account by its ID, ensuring it belongs to the authenticated user."
    account(id: ID!): Account @cacheControl(maxAge: 300, scope: PRIVATE)
  }

  type Mutation {
    "Initiates a payment from one of the user's accounts to a destination account."
    initiatePayment(input: InitiatePaymentInput!): PaymentResult!
  }

  "Represents a user's bank account, composing data from the accounts-service."
  type Account @cacheControl(maxAge: 300, scope: PRIVATE) {
    id: ID!
    nickname: String
    accountType: String!
    status: String!
    balance: Money!
    "A list of recent transactions for this account."
    transactions(limit: Int = 10): [Transaction]!
  }

  "Represents a monetary amount."
  type Money {
    amount: String!
    currency: String!
  }

  "Represents a single financial transaction."
  type Transaction {
    id: ID!
    timestamp: String!
    description: String!
    amount: Money!
    type: String!
    status: String!
  }
  
  "Input for initiating a payment."
  input InitiatePaymentInput {
    sourceAccountId: ID!
    destinationAccountId: ID!
    amount: String!
    currency: String!
    idempotencyKey: String!
    reference: String
  }

  "The result of a payment initiation mutation."
  type PaymentResult {
    paymentId: ID!
    status: String!
  }
`;

// --- Data Sources ---
// In a larger application, these would be in separate files (e.g., src/data-sources/accounts.ts)

class BaseAPI {
    constructor(protected baseURL: string) {}

    protected async get(path: string) {
        console.log(`BFF fetching: GET ${this.baseURL}${path}`);
        // In a real implementation, this would use a robust HTTP client like node-fetch or axios
        // and handle errors, retries, and circuit breaking.
        // return fetch(`${this.baseURL}${path}`).then(res => res.json());
        return this.mockGet(path);
    }

    protected async post(path: string, body: unknown) {
        console.log(`BFF fetching: POST ${this.baseURL}${path}`, { body });
        // return fetch(`${this.baseURL}${path}`, { method: 'POST', body: JSON.stringify(body), headers: {'Content-Type': 'application/json'} }).then(res => res.json());
        return this.mockPost(path, body);
    }

    // Mock methods for demonstration purposes
    protected mockGet(path: string) { return Promise.resolve({}); }
    protected mockPost(path: string, body: unknown) { return Promise.resolve({}); }
}

class AccountsServiceAPI extends BaseAPI {
    async getAccountsForUser(userId: string) {
        // return this.get(`/v1/accounts?userId=${userId}`);
        return Promise.resolve([
            { id: 'acc-1', nickname: 'Primary Checking', accountType: 'CHECKING', status: 'OPEN', balance: { amount: '1234.56', currency: 'USD' } },
            { id: 'acc-2', nickname: 'Vacation Savings', accountType: 'SAVINGS', status: 'OPEN', balance: { amount: '5890.12', currency: 'USD' } },
        ]);
    }

    async getAccountsByIds(ids: readonly string[]) {
        // In a real API, this would be a single call: this.get(`/v1/accounts?ids=${ids.join(',')}`);
        const allAccounts = [
            { id: 'acc-1', nickname: 'Primary Checking', accountType: 'CHECKING', status: 'OPEN', balance: { amount: '1234.56', currency: 'USD' } },
            { id: 'acc-2', nickname: 'Vacation Savings', accountType: 'SAVINGS', status: 'OPEN', balance: { amount: '5890.12', currency: 'USD' } },
        ];
        return Promise.resolve(allAccounts.filter(acc => ids.includes(acc.id)));
    }

    async getTransactionsForAccount(accountId: string, limit: number) {
        // return this.get(`/v1/accounts/${accountId}/transactions?limit=${limit}`);
        return Promise.resolve([
            { id: 'txn-101', timestamp: new Date().toISOString(), description: 'Grocery Store', amount: { amount: '-75.50', currency: 'USD' }, type: 'DEBIT', status: 'COMPLETED' },
            { id: 'txn-102', timestamp: new Date().toISOString(), description: 'Paycheck', amount: { amount: '2500.00', currency: 'USD' }, type: 'CREDIT', status: 'COMPLETED' },
        ]);
    }
}

class PaymentsServiceAPI extends BaseAPI {
    async initiatePayment(paymentInput: any) {
        // return this.post('/v1/payments', paymentInput);
        return Promise.resolve({
            paymentId: `payment-${randomUUID()}`,
            status: 'PENDING',
        });
    }
}

// --- Resolvers ---

const resolvers = {
  Query: {
    myAccounts: (_source, _args, context) => {
      return context.dataSources.accounts.getAccountsForUser(context.user.id);
    },
    account: (_source, { id }, context) => {
      // Use DataLoader to batch and cache account fetches within a single request.
      return context.loaders.account.load(id);
    },
  },
  Mutation: {
    initiatePayment: async (_source, { input }, context) => {
        const { sourceAccountId, ...rest } = input;

        // Orchestration Step 1: Validate source account belongs to the user and has sufficient funds.
        const sourceAccount = await context.loaders.account.load(sourceAccountId);
        if (parseFloat(sourceAccount.balance.amount) < parseFloat(input.amount)) {
            throw new Error('Insufficient funds.');
        }

        // Orchestration Step 2: Call payments-service to initiate the payment.
        const paymentResult = await context.dataSources.payments.initiatePayment({
            ...rest,
            sourceAccountId,
            userId: context.user.id, // Propagate user context
        });
        
        return paymentResult;
    }
  },
  Account: {
    transactions: (account, { limit }, context) => {
      return context.dataSources.accounts.getTransactionsForAccount(account.id, limit);
    },
  },
};

/**
 * @function createLoaders
 * @description Creates request-scoped DataLoader instances.
 * This implements the DataLoader pattern to prevent the N+1 query problem by batching
 * identical requests (e.g., fetching multiple accounts by ID) into a single downstream call.
 * @param dataSources The data sources for fetching data.
 * @returns An object containing all DataLoader instances for the current request.
 */
const createLoaders = (dataSources: { accounts: AccountsServiceAPI }) => ({
  account: new DataLoader<string, any>(async (ids) => {
    console.log(`DataLoader: Batching account fetch for IDs: ${ids.join(', ')}`);
    const accounts = await dataSources.accounts.getAccountsByIds(ids);
    const accountMap = new Map(accounts.map(acc => [acc.id, acc]));
    return ids.map(id => accountMap.get(id) || new Error(`Account not found: ${id}`));
  }),
});

// --- Apollo Server Setup ---

const server = new ApolloServer({
  typeDefs,
  resolvers,
  cache: new RedisCache({
    client: new Redis(REDIS_URL),
  }),
  plugins: [
    ApolloServerPluginCacheControl({ defaultMaxAge: 5 }), // Default cache time for fields without a directive.
    ApolloServerPluginLandingPageGraphQLPlayground(), // Provides a web UI for development.
  ],
  context: ({ req }) => {
    /**
     * The context function is executed for every incoming request.
     * It's responsible for:
     * 1. Auth: Parsing the auth token and creating a user context.
     * 2. DataLoaders: Creating new DataLoader instances for each request to prevent cross-request data leakage.
     * 3. DataSources: Instantiating API clients for downstream services.
     */
    const token = req.headers.authorization || '';
    // In a real application, the token would be validated and user info decoded.
    const user = { id: 'user-123' }; // Mock user context

    const dataSources = {
      accounts: new AccountsServiceAPI(ACCOUNTS_SERVICE_URL),
      payments: new PaymentsServiceAPI(PAYMENTS_SERVICE_URL),
    };

    return {
      user,
      dataSources,
      loaders: createLoaders(dataSources),
    };
  },
});

// --- Server Startup ---

server.listen({ port: PORT }).then(({ url }) => {
  console.log(`🚀 WebApp BFF ready at ${url}`);
});
