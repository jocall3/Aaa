/**
 * @file payment.pg.mapper.ts
 * @description This file contains the data mapper for the Payment aggregate, responsible for
 * converting between the domain model and the PostgreSQL persistence model.
 * It's a key component of the infrastructure layer, implementing the GenericDataMapper
 * interface as per the architectural directives for a multi-layered persistence pattern.
 * This mapper is intended to be used by a repository that persists the aggregate's state (snapshotting),
 * abstracting away the database schema from the domain.
 *
 * @see /docs/adr/ADR-005-generic-repository-pattern.md
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

import { injectable } from 'tsyringe';
import { PaymentAggregate, PaymentStatus } from '../../../domain/model/payment.aggregate';

// NOTE: The following interfaces are defined here for clarity as they would typically
// be in shared library files which are not part of this specific generation task.

/**
 * @interface PaymentEntity
 * @description Defines the shape of the payment data as it is stored in the PostgreSQL database.
 * This represents the persistence model for a Payment.
 */
export interface PaymentEntity {
  id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  reason_for_failure: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

/**
 * @interface GenericDataMapper
 * @description Defines a generic contract for mapping between domain and persistence models.
 * @template TDomain The domain model (e.g., Aggregate Root).
 * @template TPersistence The persistence model (e.g., ORM entity).
 */
export interface GenericDataMapper<TDomain, TPersistence> {
  /**
   * Maps a persistence model to a domain model.
   * @param {TPersistence} persistenceEntity - The entity from the persistence layer.
   * @returns {TDomain} The reconstituted domain model.
   */
  toDomain(persistenceEntity: TPersistence): TDomain;

  /**
   * Maps a domain model to a persistence model.
   * @param {TDomain} domainEntity - The domain model instance.
   * @returns {TPersistence} The entity ready for the persistence layer.
   */
  toPersistence(domainEntity: TDomain): TPersistence;
}

/**
 * @class PaymentPgMapper
 * @description Implements the data mapping logic for the Payment aggregate.
 * It is designed to be injected as a dependency into the repository adapter.
 * @implements {GenericDataMapper<PaymentAggregate, PaymentEntity>}
 */
@injectable()
export class PaymentPgMapper implements GenericDataMapper<PaymentAggregate, PaymentEntity> {

  /**
   * Converts a `PaymentEntity` from the persistence layer into a `PaymentAggregate` domain model.
   *
   * @public
   * @param {PaymentEntity} persistence - The raw data object from the database.
   * @returns {PaymentAggregate} The reconstituted `PaymentAggregate` instance.
   *
   * @remarks
   * This method reconstitutes an aggregate from its state snapshot. To do this without breaking
   * encapsulation (i.e., modifying private properties directly), it relies on a specific hydration
   * mechanism. The ideal approach is a static factory method on the aggregate (e.g., `fromState`).
   * In the absence of such a method on the provided `PaymentAggregate`, this implementation uses
   * a reflective workaround (`Object.assign`) to populate the reconstituted instance. This is a
   * compromise and assumes the internal structure of the aggregate.
   *
   * @example
   * const paymentEntity = { id: '...', version: 2, ... };
   * const paymentAggregate = paymentPgMapper.toDomain(paymentEntity);
   */
  public toDomain(persistence: PaymentEntity): PaymentAggregate {
    // The constructor is private, a pattern to enforce creation via factory methods.
    // For reconstitution, we bypass the constructor. A static `fromState` factory method
    // on the aggregate is the preferred, cleaner pattern.
    const aggregate = Object.create(PaymentAggregate.prototype);

    // Manually assigning properties. This is fragile and couples the mapper to the
    // aggregate's internal implementation. A `fromState` factory method would
    // encapsulate this logic within the domain model itself.
    Object.assign(aggregate, {
      _id: persistence.id,
      _sourceAccountId: persistence.source_account_id,
      _destinationAccountId: persistence.destination_account_id,
      _amount: Number(persistence.amount), // Ensure correct type from DB
      _currency: persistence.currency,
      _status: persistence.status as PaymentStatus,
      _reference: persistence.reference,
      _reasonForFailure: persistence.reason_for_failure ?? undefined,
      _createdAt: persistence.created_at,
      _updatedAt: persistence.updated_at,
      _version: persistence.version, // Version is critical for optimistic concurrency
      _uncommittedEvents: [], // Rehydrated aggregates start with no new events
    });

    return aggregate as PaymentAggregate;
  }

  /**
   * Converts a `PaymentAggregate` domain model into a `PaymentEntity` for persistence.
   *
   * @public
   * @param {PaymentAggregate} domain - The instance of the domain aggregate.
   * @returns {PaymentEntity} The plain object ready to be saved to the database.
   *
   * @example
   * const paymentAggregate = PaymentAggregate.initiate(...);
   * const paymentEntity = paymentPgMapper.toPersistence(paymentAggregate);
   * // Now paymentEntity can be saved by a repository.
   */
  public toPersistence(domain: PaymentAggregate): PaymentEntity {
    // The version property is essential for optimistic concurrency control.
    // We assume the AggregateRoot base class provides access to it.
    const version = (domain as any).version ?? 0;

    return {
      id: domain.id,
      source_account_id: domain.sourceAccountId,
      destination_account_id: domain.destinationAccountId,
      amount: domain.amount,
      currency: domain.currency,
      status: domain.status,
      reference: domain.reference,
      reason_for_failure: domain.reasonForFailure || null,
      created_at: domain.createdAt,
      updated_at: domain.updatedAt,
      version: version + domain.getUncommittedEvents().length, // The next version to be saved
    };
  }
}
