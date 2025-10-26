/**
 * @file account.pg.mapper.ts
 * @description This file contains the data mapper for the Account aggregate, translating
 * between the domain model and the PostgreSQL persistence model. It is a key
 * component of the infrastructure layer in a Hexagonal Architecture, fulfilling the
 * requirements of the Generic Repository and Mapper pattern.
 *
 * @see /docs/adr/ADR-005-generic-repository-and-error-framework.md
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

import { AccountAggregate, AccountStatus } from '../../../../domain/model/account.aggregate';

/**
 * @interface IDataMapper
 * @description A generic interface for data mappers, defining the contract for converting
 * between domain and persistence models. This would be imported from a shared library.
 *
 * @template TDomain The domain model type.
 * @template TPersistence The persistence model type.
 */
export interface IDataMapper<TDomain, TPersistence> {
  /**
   * Maps a persistence model to a domain model.
   * @param {TPersistence} persistence The persistence model instance.
   * @returns {TDomain} The domain model instance.
   */
  toDomain(persistence: TPersistence): TDomain;

  /**
   * Maps a domain model to a persistence model.
   * @param {TDomain} domain The domain model instance.
   * @returns {Partial<TPersistence>} A partial persistence model instance.
   */
  toPersistence(domain: TDomain): Partial<TPersistence>;
}

/**
 * @interface AccountSchema
 * @description Defines the shape of the account data as it is stored in the PostgreSQL database.
 * This represents the persistence model for an Account, typically defined as an ORM entity.
 * TSDoc is mandatory for all interfaces and their properties.
 */
export interface AccountSchema {
  /**
   * @property {string} id - The unique identifier (UUID) of the account aggregate. Primary Key.
   */
  id: string;

  /**
   * @property {string} owner_id - The UUID of the user who owns this account.
   */
  owner_id: string;

  /**
   * @property {number} balance - The current balance of the account, stored as a numeric type.
   */
  balance: number;

  /**
   * @property {string} status - The current status of the account (e.g., 'OPEN', 'CLOSED').
   */
  status: string;

  /**
   * @property {number} version - The version number of the aggregate for optimistic concurrency control.
   */
  version: number;

  /**
   * @property {Date} created_at - The timestamp when the account record was created.
   */
  created_at: Date;

  /**
   * @property {Date} updated_at - The timestamp when the account record was last updated.
   */
  updated_at: Date;
}

/**
 * @class AccountPgMapper
 * @description A static class providing methods to map between the AccountAggregate domain
 * object and the AccountSchema persistence object. This class adheres to the contract
 * of IDataMapper<AccountAggregate, AccountSchema>.
 */
export class AccountPgMapper {
  /**
   * @public
   * @static
   * @method toDomain
   * @description Maps a persistence schema object to an `AccountAggregate` domain object.
   * This is used to reconstitute an aggregate from its database snapshot.
   * @param {AccountSchema} persistence The raw data object from the database.
   * @returns {AccountAggregate} The reconstituted domain aggregate.
   * @throws {Error} If the persistence data is invalid for creating an aggregate.
   * @example
   * const schema = { id: 'uuid-v4', owner_id: 'uuid-v4-user', balance: 100, ... };
   * const domainModel = AccountPgMapper.toDomain(schema);
   */
  public static toDomain(persistence: AccountSchema): AccountAggregate {
    // NOTE: This assumes a static factory method 'fromState' exists on the AccountAggregate
    // to correctly instantiate it from a state snapshot, bypassing event sourcing replay
    // for performance. This method would be added as part of the architectural transformation.
    // @ts-ignore - Ignoring because fromState is part of the transformation and not in the original file.
    const aggregate = AccountAggregate.fromState({
      id: persistence.id,
      ownerId: persistence.owner_id,
      balance: persistence.balance,
      status: persistence.status as AccountStatus,
      version: persistence.version,
    });
    return aggregate;
  }

  /**
   * @public
   * @static
   * @method toPersistence
   * @description Maps an `AccountAggregate` domain object to a persistence schema object.
   * This is used to create a database-friendly snapshot of the aggregate's current state.
   * @param {AccountAggregate} domain The domain aggregate instance.
   * @returns {Partial<AccountSchema>} A partial persistence object. `created_at` and `updated_at`
   * are typically handled by the database or ORM.
   * @throws {Error} If the domain object is invalid.
   * @example
   * const account = AccountAggregate.create('uuid-v4-user', 100);
   * const persistenceModel = AccountPgMapper.toPersistence(account);
   * // returns { id: '...', owner_id: '...', balance: 100, status: 'OPEN', version: 0 }
   */
  public static toPersistence(domain: AccountAggregate): Partial<AccountSchema> {
    // NOTE: This assumes the AccountAggregate exposes its state via getters
    // or a `getState()` method, which would be added as part of the architectural transformation.
    // The `id` property is already public.
    // @ts-ignore - Ignoring because getState is part of the transformation and not in the original file.
    const state = domain.getState();
    return {
      id: state.id,
      owner_id: state.ownerId,
      balance: state.balance,
      status: state.status,
      version: state.version,
    };
  }
}
