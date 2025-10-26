/**
 * @fileoverview This file contains the handler for the GetAccountDetailsQuery.
 * It is responsible for processing the query and retrieving account details
 * from the read repository, adhering to the CQRS pattern.
 */

import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { AccountDetailsDto } from '../../domain/dto/account-details.dto';
import { IAccountReadRepository } from '../../domain/ports/account-read.repository.port';
import { GetAccountDetailsQuery } from './get-account-details.query';

/**
 * @class GetAccountDetailsHandler
 * @classdesc Handles the execution of the GetAccountDetailsQuery.
 * This handler is part of the application layer in a Hexagonal Architecture.
 * It uses a port (IAccountReadRepository) to fetch data from the persistence layer,
 * thus remaining independent of the specific data storage technology.
 * @implements {IQueryHandler<GetAccountDetailsQuery, AccountDetailsDto | null>}
 */
@QueryHandler(GetAccountDetailsQuery)
export class GetAccountDetailsHandler
  implements IQueryHandler<GetAccountDetailsQuery, AccountDetailsDto | null>
{
  /**
   * @constructor
   * @param {IAccountReadRepository} accountReadRepository - The repository for accessing account read models.
   * The repository is injected using a token to maintain loose coupling with the infrastructure layer.
   */
  constructor(
    @Inject('IAccountReadRepository')
    private readonly accountReadRepository: IAccountReadRepository,
  ) {}

  /**
   * @method execute
   * @description Executes the GetAccountDetailsQuery. It retrieves the details of a single account
   * using the provided account ID from the query.
   * @param {GetAccountDetailsQuery} query - The query object containing the accountId.
   * @returns {Promise<AccountDetailsDto | null>} A promise that resolves to the account details
   * Data Transfer Object (DTO) if found, otherwise null.
   */
  async execute(
    query: GetAccountDetailsQuery,
  ): Promise<AccountDetailsDto | null> {
    const { accountId } = query;

    // The core logic is to delegate the data retrieval to the read repository.
    // This repository is responsible for querying the denormalized read model.
    const accountDetails = await this.accountReadRepository.findById(accountId);

    if (!accountDetails) {
      // Depending on business rules, you might throw an exception or return null.
      // Returning null is a common pattern for query handlers when a resource is not found.
      return null;
    }

    // The repository is expected to return an object that already matches the DTO shape.
    // If it returned a different domain entity for the read model, a mapping step would be required here.
    return accountDetails;
  }
}
