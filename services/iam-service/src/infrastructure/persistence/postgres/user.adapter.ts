import { injectable } from 'tsyringe';
import { Repository } from 'typeorm';
import { IUserRepository } from '../../../domain/ports/user.repository.port';
import { User } from '../../../domain/aggregates/user.aggregate';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { UserEntity } from './user.entity';
import { AppDataSource } from './data-source';
import { UserMapper } from './user.mapper';

/**
 * @class UserPostgresAdapter
 * @implements {IUserRepository}
 * @description
 * This class serves as the persistence adapter for User aggregates, implementing the IUserRepository port.
 * It uses PostgreSQL as the underlying database and TypeORM as the ORM. This adapter is part of the
 * infrastructure layer in a Hexagonal Architecture, responsible for translating domain objects
 * into a format suitable for the database and vice versa.
 *
 * @see IUserRepository
 * @see User
 * @see UserEntity
 */
@injectable()
export class UserPostgresAdapter implements IUserRepository {
  private readonly userRepository: Repository<UserEntity>;

  /**
   * @constructor
   * @description
   * Constructs the UserPostgresAdapter. It initializes the TypeORM repository
   * for the UserEntity by obtaining it from the central AppDataSource.
   * This approach is used instead of direct injection of the repository to decouple
   * from framework-specific DI containers for TypeORM.
   */
  constructor() {
    // In a typical TypeORM setup without a framework-specific integration like NestJS,
    // the repository is obtained from the initialized DataSource.
    this.userRepository = AppDataSource.getRepository(UserEntity);
  }

  /**
   * @public
   * @async
   * @method findById
   * @param {UserId} id The unique identifier (Value Object) of the user.
   * @returns {Promise<User | null>} A Promise that resolves to the User aggregate if found, otherwise null.
   * @description
   * Retrieves a single user from the PostgreSQL database by their unique ID.
   * It maps the resulting persistence entity to a domain aggregate.
   */
  public async findById(id: UserId): Promise<User | null> {
    const userEntity = await this.userRepository.findOne({ 
      where: { id: id.value },
      relations: ['roles'], // Assuming roles are eagerly or explicitly loaded
    });

    if (!userEntity) {
      return null;
    }

    return UserMapper.toDomain(userEntity);
  }

  /**
   * @public
   * @async
   * @method findByEmail
   * @param {string} email The email address of the user.
   * @returns {Promise<User | null>} A Promise that resolves to the User aggregate if found, otherwise null.
   * @description
   * Retrieves a single user from the PostgreSQL database by their email address, which is expected
   * to be unique. It maps the resulting persistence entity to a domain aggregate.
   */
  public async findByEmail(email: string): Promise<User | null> {
    const userEntity = await this.userRepository.findOne({ 
      where: { email },
      relations: ['roles'],
    });

    if (!userEntity) {
      return null;
    }

    return UserMapper.toDomain(userEntity);
  }

  /**
   * @public
   * @async
   * @method save
   * @param {User} user The User aggregate to be saved or updated.
   * @returns {Promise<void>} A Promise that resolves when the operation is complete.
   * @description
   * Persists a User aggregate to the database. It handles both creation of new users
   * and updates to existing ones. The domain aggregate is first mapped to a
   * persistence-friendly entity before being passed to TypeORM's save method.
   */
  public async save(user: User): Promise<void> {
    const userEntity = UserMapper.toPersistence(user);
    await this.userRepository.save(userEntity);
  }

  /**
   * @public
   * @async
   * @method delete
   * @param {UserId} id The unique identifier (Value Object) of the user to be deleted.
   * @returns {Promise<void>} A Promise that resolves when the operation is complete.
   * @description
   * Removes a user from the PostgreSQL database using their unique identifier.
   */
  public async delete(id: UserId): Promise<void> {
    await this.userRepository.delete(id.value);
  }
}
