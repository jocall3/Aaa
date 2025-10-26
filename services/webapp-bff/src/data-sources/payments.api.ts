/**
 * @file payments.api.ts
 * @description This file defines the GraphQL data source for interacting with the downstream payments-service.
 * It encapsulates all logic for fetching and mutating payment data, including authentication,
 * caching, and error handling, as per the BFF architectural pattern.
 *
 * @see /docs/adr/ADR-003-graphql-bff.md
 * @see /docs/adr/ADR-008-caching-strategy.md
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

import { AugmentedRequest, RESTDataSource } from '@apollo/datasource-rest';

// Local and shared library imports
import { config } from '../../config';
import { IRequestContext } from '../../context';

// Assumes GraphQL Code Generator is used to create types from the schema.
import type {
  Payment,
  PaymentInitiationRequest,
  PaymentInitiationResponse,
  PaginatedPaymentList,
} from '../../graphql/generated/types';

/**
 * @class PaymentsAPI
 * @extends RESTDataSource
 * @description The GraphQL DataSource responsible for all communication with the payments-service REST API.
 * It handles request authentication by forwarding the user's JWT and implements caching strategies
 * as defined in the architectural directives.
 *
 * @implements TSDoc conventions for 100% documentation coverage.
 */
export class PaymentsAPI extends RESTDataSource {
  /**
   * The context for the current GraphQL operation.
   * @override
   * @type {IRequestContext}
   */
  override contextValue!: IRequestContext;

  /**
   * @property {string} baseURL - The base URL for the downstream payments-service.
   * This is sourced from environment configuration to allow for flexibility across environments.
   */
  override baseURL = config.services.payments.url;

  /**
   * Intercepts outgoing requests to add necessary headers, such as the user's
   * authentication token and a correlation ID for distributed tracing. This is a critical
   * step in propagating the security and observability context from the BFF
   * to downstream microservices.
   *
   * @override
   * @protected
   * @param {string} path - The path of the outgoing request.
   * @param {AugmentedRequest} request - The outgoing request object.
   * @returns {Promise<void>}
   * @see /docs/adr/ADR-004-centralized-authorization.md
   */
  protected override async willSendRequest(
    path: string,
    request: AugmentedRequest,
  ): Promise<void> {
    // Forward the Authorization token from the incoming GraphQL context.
    if (this.contextValue.token) {
      request.headers.Authorization = `Bearer ${this.contextValue.token}`;
    }

    // Forward other context headers like correlation ID for distributed tracing.
    if (this.contextValue.correlationId) {
      request.headers['X-Correlation-ID'] = this.contextValue.correlationId;
    }
  }

  /**
   * Retrieves a single payment by its unique ID from the payments-service.
   * This method is cached according to the multi-layer caching strategy to
   * improve performance for frequently accessed payments.
   *
   * @public
   * @async
   * @param {string} paymentId - The unique identifier of the payment to retrieve.
   * @returns {Promise<Payment>} A promise that resolves to the payment details.
   * @throws {ApolloError} Throws a GraphQL-friendly error if the downstream service returns an error (e.g., 404, 500).
   * @example
   * ```typescript
   * // In a GraphQL resolver:
   * const payment = await dataSources.paymentsAPI.getPaymentById('c4f3b2a0-7b6a-4b0e-8d3a-9e6b3f7e1b5c');
   * ```
   */
  async getPaymentById(paymentId: string): Promise<Payment> {
    return this.get<Payment>(`v1/payments/${paymentId}`, {
      cacheOptions: { ttl: 60 }, // Cache for 60 seconds as per ADR-008.
    });
  }

  /**
   * Retrieves a paginated list of payments, with optional filtering, from the payments-service.
   * This method is cached to improve performance on list views, with a shorter TTL.
   *
   * @public
   * @async
   * @param {object} params - The query parameters for listing payments.
   * @param {number} [params.limit=20] - The maximum number of payments to return.
   * @param {string} [params.cursor] - The pagination cursor for the next page.
   * @param {string} [params.status] - Filter payments by status.
   * @returns {Promise<PaginatedPaymentList>} A promise that resolves to a paginated list of payments.
   * @throws {ApolloError} For errors from the downstream service.
   * @example
   * ```typescript
   * // In a GraphQL resolver:
   * const payments = await dataSources.paymentsAPI.listPayments({ limit: 10 });
   * ```
   */
  async listPayments(params: {
    limit?: number;
    cursor?: string;
    status?: string;
  }): Promise<PaginatedPaymentList> {
    // The `params` object will be automatically converted to URL query parameters.
    return this.get<PaginatedPaymentList>('v1/payments', {
      params,
      cacheOptions: { ttl: 30 }, // Cache for 30 seconds.
    });
  }

  /**
   * Initiates a new payment transaction by sending a command to the payments-service.
   * This is a mutation and is not cached. It also requires an idempotency key
   * to prevent duplicate transactions, a common pattern in payment systems.
   *
   * @public
   * @async
   * @param {PaymentInitiationRequest} paymentDetails - The details of the payment to be initiated.
   * @param {string} idempotencyKey - A unique key to ensure the request is processed only once.
   * @returns {Promise<PaymentInitiationResponse>} A promise that resolves to the accepted payment initiation response.
   * @throws {ApolloError} Maps downstream errors (400, 409, 500) to GraphQL errors.
   * @example
   * ```typescript
   * // In a GraphQL resolver:
   * const response = await dataSources.paymentsAPI.initiatePayment(
   *   { sourceAccountId: '...', destination: {...}, amount: {...} },
   *   'unique-request-id-123'
   * );
   * ```
   */
  async initiatePayment(
    paymentDetails: PaymentInitiationRequest,
    idempotencyKey: string,
  ): Promise<PaymentInitiationResponse> {
    return this.post<PaymentInitiationResponse>('v1/payments', {
      body: paymentDetails,
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
  }
}
