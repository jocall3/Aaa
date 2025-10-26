/**
 * @file create-account.handler.ts
 * @description This file contains the command handler for creating a new user account.
 * It follows the CQRS pattern, processing the CreateAccountCommand to orchestrate
 * the creation of an Account aggregate.
 *
 * @see /docs/adr/ADR-002-CQRS-and-Event-Sourcing.md
 * @see /docs/adr/ADR-004-Universal-Error-Handling.md
 */

import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';

import {
  ConcurrencyError,
  TransientInfrastructureError,
  ValidationError,
} from '../../../../../libs/error-framework'; // Assuming a shared error library is at this path
import { CreateAccountCommand } from './create-account.command';
import { AccountAggregate } from '../../domain/model/account.aggregate';
import { IAccountRepository } from '../ports/account.repository';
import { ACCOUNT_REPOSITORY } from '../../domain/account.constants';

/**
 * @class CreateAccountHandler
 * @description Command handler responsible for executing the 'CreateAccountCommand'.
 * It orchestrates the creation of a new Account aggregate root, persists the resulting
 * events to the event store through the account repository port, and publishes these events.
 * This handler is a key component of the application's command side in a CQRS architecture.
 *
 * @implements {ICommandHandler<CreateAccountCommand, string>}
 * @see {@link CreateAccountCommand}
 * @see {@link AccountAggregate}
 */
@CommandHandler(CreateAccountCommand)
export class CreateAccountHandler
  implements ICommandHandler<CreateAccountCommand, string>
{
  /**
   * Constructs an instance of CreateAccountHandler.
   *
   * @public
   * @param {IAccountRepository} repository - Injected implementation of the account repository port,
   * used for event persistence. This follows the Dependency Inversion Principle, where the application
   * layer depends on an abstraction (port) defined in the domain layer.
   * @param {EventPublisher} publisher - The NestJS CQRS EventPublisher, which links the aggregate root
   * to the event bus, enabling event publication after they are committed.
   */
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly repository: IAccountRepository,
    private readonly publisher: EventPublisher,
  ) {}

  /**
   * @method execute
   * @description Handles the logic for the CreateAccountCommand.
   * This method performs the following steps:
   * 1. Creates a new `AccountAggregate` instance using a static factory method, which validates business rules and generates an `AccountCreatedEvent`.
   * 2. Bridges the new aggregate instance with the event bus using the `EventPublisher`.
   * 3. Persists the new event(s) to the event store via the repository, which is responsible for optimistic concurrency control.
   * 4. Commits the aggregate's events, which publishes them to the event bus for consumption by other parts of the system (e.g., read model projectors).
   *
   * @public
   * @param {CreateAccountCommand} command - The command DTO containing the data required to create a new account.
   * @returns {Promise<string>} A promise that resolves to the unique identifier (UUID) of the newly created account.
   * @throws {ValidationError} If the command data fails business rule validation within the Account aggregate (e.g., negative initial balance).
   * @throws {ConcurrencyError} If there is a version conflict when saving the new account's events to the event store.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the database connection during the save operation.
   * @example
   * // This is typically invoked by the framework based on a dispatched command.
   * const command = new CreateAccountCommand(
   *   'user-uuid-123',
   *   'CHECKING',
   *   'USD',
   *   100.00
   * );
   * const accountId = await commandHandler.execute(command);
   * console.log(accountId); // e.g., 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
   */
  async execute(command: CreateAccountCommand): Promise<string> {
    const { userId, accountType, currency, initialBalance } = command;

    // The factory method on the aggregate root is the single entry point for creation.
    // It ensures all invariants are met and the initial event is raised.
    const account = AccountAggregate.create(
      userId,
      accountType,
      currency,
      initialBalance,
    );

    // Bridge the newly created aggregate with the event bus.
    // This allows the aggregate to publish its events via the publisher's `commit` method.
    const accountWithPublisher = this.publisher.mergeObjectContext(account);

    // The repository is responsible for the atomicity of persisting events to the event store.
    // It handles optimistic concurrency checks. It must NOT clear uncommitted events.
    await this.repository.save(accountWithPublisher);

    // Once events are safely stored, commit() publishes them to the event bus.
    // This is what makes the state change "public" to the rest of the system.
    // The publisher's commit implementation is responsible for clearing the aggregate's uncommitted events.
    accountWithPublisher.commit();

    return account.id;
  }
}
