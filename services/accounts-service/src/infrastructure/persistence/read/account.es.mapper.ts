/**
 * @file This file contains the Elasticsearch data mapper for the Account read model.
 * @author Elite AI Implementation Team
 * @version 1.0.0
 *
 * @description
 * This mapper is responsible for transforming data between the `AccountReadModel` domain
 * object and the `AccountEsPersistence` document format used for storage in Elasticsearch.
 * It implements the `GenericDataMapper` interface, enforcing a consistent pattern for
 * data transformation across the application's persistence layer, as mandated by architectural directives.
 * This decoupling is crucial for isolating the domain from infrastructure concerns.
 */

import { Injectable } from '@nestjs/common';

// In a real-world scenario, these interfaces would be imported from shared libraries or domain layers.
// To make this file self-contained, they are defined here with explanatory TSDoc.

/**
 * @interface GenericDataMapper
 * @description A generic interface for data mapping between domain and persistence models.
 * This is a core component of the Generic Repository Pattern. It should be located
 * in a shared library (e.g., `libs/core/src/persistence/generic.mapper.ts`).
 * @template Domain The domain entity or model.
 * @template Persistence The persistence entity or model.
 */
interface GenericDataMapper<Domain, Persistence> {
  /**
   * Maps a persistence model to a domain model.
   * @param {Persistence} persistence The data object from the persistence layer.
   * @returns {Domain} The corresponding domain model object.
   */
  toDomain(persistence: Persistence): Domain;

  /**
   * Maps a domain model to a persistence model.
   * @param {Domain} domain The domain model object.
   * @returns {Persistence} The corresponding data object for the persistence layer.
   */
  toPersistence(domain: Domain): Persistence;
}

/**
 * @interface AccountReadModel
 * @description Represents the denormalized account data used for queries. This is the 'Domain' model
 * for the read side of the CQRS pattern. It should be defined in the domain layer
 * (e.g., `services/accounts-service/src/domain/read-models/account.read-model.ts`).
 */
interface AccountReadModel {
  id: string;
  customerId: string;
  userIds: string[];
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  currency: string;
  currentBalance: number;
  availableBalance: number;
  productName?: string;
  nickname?: string;
  displayAccountNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  owner?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  paymentDueDate?: Date | null;
}

/**
 * @interface AccountEsPersistence
 * @description Defines the structure of an account document as it is stored in Elasticsearch.
 * This interface mirrors the mapping defined in `infra/databases/elasticsearch/account-read-model.mapping.json`.
 * It is internal to the persistence layer.
 * @internal
 */
export interface AccountEsPersistence {
  accountId: string;
  customerId: string;
  userIds: string[];
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  currencyCode: string;
  currentBalance: number;
  availableBalance: number;
  productName?: string;
  accountNickname?: string;
  displayAccountNumber?: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  owner?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  paymentDueDate?: string | null; // ISO 8601 date string
}

/**
 * @class AccountEsMapper
 * @implements GenericDataMapper<AccountReadModel, AccountEsPersistence>
 * @description Concrete implementation of the data mapper for the Account read model and Elasticsearch.
 */
@Injectable()
export class AccountEsMapper
  implements GenericDataMapper<AccountReadModel, AccountEsPersistence>
{
  /**
   * @method toDomain
   * @description Maps an Elasticsearch persistence document to an `AccountReadModel` domain object.
   * It handles transformations such as renaming fields (e.g., `accountId` to `id`) and converting
   * data types (e.g., ISO date strings to `Date` objects).
   * @param {AccountEsPersistence} persistence The raw document from Elasticsearch.
   * @returns {AccountReadModel} The structured domain read model object.
   * @example
   * const esDoc = { accountId: 'uuid-123', accountStatus: 'ACTIVE', createdAt: '2023-01-01T00:00:00.000Z', ... };
   * const domainModel = mapper.toDomain(esDoc);
   * // domainModel is { id: 'uuid-123', status: 'ACTIVE', createdAt: new Date('2023-01-01T00:00:00.000Z'), ... }
   */
  public toDomain(persistence: AccountEsPersistence): AccountReadModel {
    return {
      id: persistence.accountId,
      customerId: persistence.customerId,
      userIds: persistence.userIds,
      status: persistence.accountStatus,
      currency: persistence.currencyCode,
      currentBalance: persistence.currentBalance,
      availableBalance: persistence.availableBalance,
      productName: persistence.productName,
      nickname: persistence.accountNickname,
      displayAccountNumber: persistence.displayAccountNumber,
      createdAt: new Date(persistence.createdAt),
      updatedAt: new Date(persistence.updatedAt),
      owner: persistence.owner
        ? {
            name: persistence.owner.name,
            address: persistence.owner.address,
            city: persistence.owner.city,
            state: persistence.owner.state,
            postalCode: persistence.owner.postalCode,
            country: persistence.owner.country,
          }
        : undefined,
      paymentDueDate: persistence.paymentDueDate
        ? new Date(persistence.paymentDueDate)
        : null,
    };
  }

  /**
   * @method toPersistence
   * @description Maps an `AccountReadModel` domain object back to an Elasticsearch persistence document.
   * It handles the reverse transformations, preparing the object for indexing.
   * @param {AccountReadModel} domain The domain read model object.
   * @returns {AccountEsPersistence} The raw document ready to be sent to Elasticsearch.
   * @example
   * const domainModel = { id: 'uuid-123', status: 'ACTIVE', createdAt: new Date(), ... };
   * const esDoc = mapper.toPersistence(domainModel);
   * // esDoc is { accountId: 'uuid-123', accountStatus: 'ACTIVE', createdAt: '...', ... }
   */
  public toPersistence(domain: AccountReadModel): AccountEsPersistence {
    return {
      accountId: domain.id,
      customerId: domain.customerId,
      userIds: domain.userIds,
      accountStatus: domain.status,
      currencyCode: domain.currency,
      currentBalance: domain.currentBalance,
      availableBalance: domain.availableBalance,
      productName: domain.productName,
      accountNickname: domain.nickname,
      displayAccountNumber: domain.displayAccountNumber,
      createdAt: domain.createdAt.toISOString(),
      updatedAt: domain.updatedAt.toISOString(),
      owner: domain.owner
        ? {
            name: domain.owner.name,
            address: domain.owner.address,
            city: domain.owner.city,
            state: domain.owner.state,
            postalCode: domain.owner.postalCode,
            country: domain.owner.country,
          }
        : undefined,
      paymentDueDate: domain.paymentDueDate
        ? domain.paymentDueDate.toISOString()
        : null,
    };
  }
}
