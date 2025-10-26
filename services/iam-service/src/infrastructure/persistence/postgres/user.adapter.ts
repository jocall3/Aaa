/**
 * @file This file contains the PostgreSQL adapter for the IUserRepository port.
 * @description It implements the IUserRepository interface using a generic, multi-layered
 * repository pattern, with TypeORM as the underlying data access technology. This adapter
 * is a key component of the infrastructure layer in a Hexagonal Architecture.
 * @module infrastructure/persistence/postgres/user.adapter
 * @see {@link ../../../application/ports/user.repository.ts} for the port definition.
 * @see {@link @libs/infrastructure/persistence/typeorm.repository.base.ts} for the generic base class (hypothetical).
 */

// Core imports from shared libraries demonstrating the new generic pattern.
// These are hypothetical paths as per the architectural directives.
import { TypeOrmRepositoryBase } from '@libs/infrastructure/persistence/typeorm.repository.base';

// Third-party imports for dependency injection and data access.
import { injectable } from 'tsyringe';

// Application-specific imports
import { IUserRepository } from '../../../application/ports/user.repository';
import { UserAggregate, IDomainEvent } from '../../../domain/model/user.aggregate';
import { UserEntity } from './user.entity'; // The TypeORM entity for the User.
import { UserMapper } from './user.mapper'; // The concrete data mapper for User.
import { AppDataSource } from './data-source'; // Assumed to be the way to get a DataSource connection.
// import { IEventPublisher } from '@libs/ddd/domain/ports/event-publisher.port'; // Hypothetical event publisher port

/**
 * @class UserPostgresAdapter
 * @classdesc The concrete implementation of the IUserRepository port using PostgreSQL and TypeORM.
 * It extends a generic base repository to encapsulate common persistence logic and uses a
 * dedicated mapper to translate between the domain aggregate and the persistence entity. This
 * adheres to the "Generic Repository Pattern" and provides multiple layers of abstraction
 * over the database.
 * @implements {IUserRepository}
 * @extends {TypeOrmRepositoryBase<UserAggregate, UserEntity>}
 */
@injectable()
export class UserPostgresAdapter
  extends TypeOrmRepositoryBase<UserAggregate, UserEntity>
  implements IUserRepository
{
  /**
   * @constructor
   * @description Constructs the UserPostgresAdapter. It initializes the base repository with a
   * concrete TypeORM repository and a data mapper, fulfilling the multi-layer pattern.
   *
   * @example
   * ```typescript
   * // In a DI container setup:
   * container.register(IUserRepository, { useClass: UserPostgresAdapter });
   * const userRepository = container.resolve(IUserRepository);
   * ```
   */
  constructor(
    // @inject('IEventPublisher') private readonly eventPublisher: IEventPublisher // Injected for domain event dispatching
  ) {
    // The generic base class is instantiated with the specific TypeORM repository and a mapper.
    // This establishes the two layers of indirection required by the architectural directive.
    super(
      AppDataSource.getRepository(UserEntity), // Layer 1: Specific ORM Repository is abstracted.
      new UserMapper(), // Layer 2: Mapping logic is abstracted.
      'UserAggregate', // Aggregate name for logging purposes.
    );
  }

  /**
   * Finds a user by their email address.
   * This is a custom method specific to the user repository, not part of the generic interface.
   *
   * @public
   * @async
   * @param {string} email - The email address of the user to find.
   * @returns {Promise<UserAggregate | null>} A promise that resolves to the user aggregate or null if not found.
   * @throws {InfrastructureError} If there is a problem querying the database (re-thrown from base class).
   *
   * @example
   * const user = await userRepository.findByEmail('jane.doe@example.com');
   */
  public async findByEmail(email: string): Promise<UserAggregate | null> {
    this.logger.debug(`[UserPostgresAdapter]: Finding user by email: ${email}`);

    // The underlying ORM repository is accessible from the base class as 'this.repository'.
    const userEntity = await this.repository.findOne({
      where: { email },
      relations: ['roles'], // Example of loading related entities, if any.
    });

    if (!userEntity) {
      this.logger.warn(`[UserPostgresAdapter]: User with email "${email}" not found.`);
      return null;
    }

    // The mapper, also in the base class as 'this.mapper', converts the persistence model to the domain model.
    return this.mapper.toDomain(userEntity);
  }

  /**
   * Persists the state of a UserAggregate and publishes its uncommitted domain events.
   * This override of the base `save` method adds the crucial step of event dispatching after
   * a successful database transaction, a core requirement of DDD and Event Sourcing patterns.
   *
   * @public
   * @async
   * @override
   * @param {UserAggregate} user - The user aggregate instance with pending changes.
   * @returns {Promise<void>}
   * @throws {InfrastructureError} If saving to the database fails (re-thrown from base class).
   * @throws {ConcurrencyException} If a version mismatch is detected (re-thrown from base class).
   *
   * @example
   * const newUser = await UserAggregate.register(...);
   * await userRepository.save(newUser); // Persists user and dispatches UserRegisteredEvent
   */
  public async save(user: UserAggregate): Promise<void> {
    // The base 'save' method handles mapping to entity and the actual DB save operation.
    await super.save(user);

    // After successfully persisting state, dispatch any domain events the aggregate has raised.
    // This would typically be handled by a Domain Event Dispatcher or a Unit of Work pattern
    // to ensure atomicity, but is shown here for clarity.
    const events: IDomainEvent[] = user.getUncommittedEvents();
    if (events.length > 0) {
      this.logger.debug(`[UserPostgresAdapter]: Publishing ${events.length} domain events for User ${user.id}.`);
      
      // In a real implementation, an injected IEventPublisher port would be used.
      // await this.eventPublisher.publish(events);
      
      // Once published, clear the events from the aggregate.
      user.markEventsAsCommitted();
    }
  }

  // Note: The `findById(id: string)` and `delete(id: string)` methods are inherited from the
  // generic 'TypeOrmRepositoryBase' class. They automatically fulfill the IUserRepository port's
  // contract, so no further implementation is needed here.
}
