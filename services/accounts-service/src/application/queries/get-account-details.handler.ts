/**
 * @fileoverview This file contains the handler for the GetAccountDetailsQuery.
 * @description In adherence with CQRS, this query handler is responsible for fetching a denormalized
 * account representation from the read store. It implements a cache-aside strategy as mandated by
 * the multi-layer caching directive and uses the universal error framework.
 * @version 2.0.0
 * @since 1.0.0
 */

import { Inject, Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

// The ICache port is from the new shared caching-client library.
import { ICache } from '@libs/caching-client'; 

// Custom error classes are from the new shared error-framework library.
import { NotFoundError, TransientInfrastructureError } from '@libs/error-framework';

import { AccountDetailsDto } from '../../domain/dto/account-details.dto';
// The IAccountReadRepository is an application-layer port.
import { IAccountReadRepository } from '../ports/account-read.repository.port';
import { GetAccountDetailsQuery } from './get-account-details.query';

const ACCOUNT_DETAILS_CACHE_TTL_SECONDS = 300; // 5 minutes. Should be configurable.
const ACCOUNT_DETAILS_CACHE_PREFIX = 'account-details';

/**
 * @class GetAccountDetailsHandler
 * @classdesc Handles the execution of the `GetAccountDetailsQuery`.
 * This handler is part of the application layer in a Hexagonal Architecture. It orchestrates
 * data retrieval by first checking a distributed cache (Redis) via the `ICache` port. On a cache miss,
 * it fetches data from the persistence layer via the `IAccountReadRepository` port, populates the cache,
 * and returns the data. It throws a `NotFoundError` if the account does not exist.
 *
 * @implements {IQueryHandler<GetAccountDetailsQuery, AccountDetailsDto>}
 */
@QueryHandler(GetAccountDetailsQuery)
export class GetAccountDetailsHandler
  implements IQueryHandler<GetAccountDetailsQuery, AccountDetailsDto>
{
  private readonly logger = new Logger(GetAccountDetailsHandler.name);

  /**
   * @constructor
   * @param {IAccountReadRepository} accountReadRepository - The injected repository port for accessing account read models.
   * @param {ICache} cache - The injected client port for the distributed caching layer.
   */
  constructor(
    @Inject('IAccountReadRepository')
    private readonly accountReadRepository: IAccountReadRepository,
    @Inject('ICache')
    private readonly cache: ICache,
  ) {}

  /**
   * Executes the `GetAccountDetailsQuery`. It retrieves the details of a single account
   * using the provided account ID, leveraging a cache-aside pattern.
   *
   * @public
   * @async
   * @param {GetAccountDetailsQuery} query - The query object containing the `accountId`.
   * @returns {Promise<AccountDetailsDto>} A promise that resolves to the account details DTO.
   * @throws {NotFoundError} If no account with the specified ID is found.
   * @throws {TransientInfrastructureError} If there is a transient issue with the cache or database.
   *
   * @example
   * ```typescript
   * const accountDetails = await queryBus.execute(
   *   new GetAccountDetailsQuery('a1b2c3d4-e5f6-7890-1234-567890abcdef')
   * );
   * console.log(accountDetails.balance);
   * ```
   */
  public async execute(
    query: GetAccountDetailsQuery,
  ): Promise<AccountDetailsDto> {
    const { accountId } = query;
    const cacheKey = `${ACCOUNT_DETAILS_CACHE_PREFIX}:${accountId}`;

    // 1. Attempt to retrieve from cache
    try {
      const cachedData = await this.cache.get(cacheKey);
      if (cachedData) {
        this.logger.debug(`[Cache Hit] Found account details for ID: ${accountId}`);
        // Data in cache is stored as a string, so parse it.
        return JSON.parse(cachedData) as AccountDetailsDto;
      }
    } catch (error) {
      // Log cache errors but proceed to fetch from the source of truth.
      // This makes the cache resilient to transient failures.
      this.logger.error(
        `Cache lookup failed for key "${cacheKey}". Fetching from repository.`,
        error.stack,
      );
      // Optional: re-throw as a specific infrastructure error if cache is critical
      // throw new TransientInfrastructureError('Cache service is unavailable.', 'CACHE_GET_FAILED', { originalError: error });
    }

    this.logger.debug(`[Cache Miss] for key: "${cacheKey}". Fetching from repository.`);

    // 2. On cache miss, fetch from the read repository
    const accountDetails = await this.accountReadRepository.findById(accountId);

    // 3. If not found in the repository, throw a domain-specific error
    if (!accountDetails) {
      throw new NotFoundError(
        `Account with ID '${accountId}' not found.`,
        'ACCOUNT_NOT_FOUND', // Cataloged error code for monitoring and alerting
      );
    }

    // 4. If found, populate the cache for subsequent requests
    try {
      await this.cache.set(
        cacheKey,
        JSON.stringify(accountDetails),
        { ttl: ACCOUNT_DETAILS_CACHE_TTL_SECONDS },
      );
      this.logger.debug(`[Cache Set] Stored account details for ID: ${accountId}`);
    } catch (error) {
      // Log cache-setting errors but do not fail the request, as the primary
      // goal of returning the data has been met.
      this.logger.warn(
        `Failed to set cache for key "${cacheKey}". The request succeeded but subsequent requests will miss the cache.`,
        error.stack,
      );
    }

    // 5. Return the retrieved data
    return accountDetails;
  }
}
