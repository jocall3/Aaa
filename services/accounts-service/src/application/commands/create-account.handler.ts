/**
 * @file create-account.handler.ts
 * @description This file contains the command handler for creating a new user account.
 * It follows the CQRS pattern, processing the CreateAccountCommand to orchestrate
 * the creation of an Account aggregate.
 */

import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { CreateAccountCommand } from './create-account.command';
import { Account } from '../../../domain/aggregates/account.aggregate';
import { IAccountRepository } from '../../../domain/ports/account.repository.interface';
import { ACCOUNT_REPOSITORY } from '../../../domain/constants';

/**
 * @class CreateAccountHandler
 * @description Command handler responsible for executing the 'CreateAccountCommand'.
 * It orchestrates the creation of a new Account aggregate root, persists the resulting
 * events to the event store through the account repository port, and publishes these events.
 * This handler is a key component of the application's command side in a CQRS architecture.
 * @implements {ICommandHandler<CreateAccountCommand, string>}
 */
@CommandHandler(CreateAccountCommand)
export class CreateAccountHandler implements ICommandHandler<CreateAccountCommand, string> {
  /**
   * Constructs an instance of CreateAccountHandler.
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
   * 1. Generates a unique ID for the new account.
   * 2. Bridges the new Account aggregate instance with the event bus.
   * 3. Invokes the domain logic on the aggregate to create the account, which generates an `AccountCreatedEvent`.
   * 4. Persists the new event(s) to the event store via the repository.
   * 5. Commits and publishes the event(s) to the event bus for consumption by other parts of the system (e.g., read model projectors).
   * @param {CreateAccountCommand} command - The command DTO containing the data required to create a new account.
   * @returns {Promise<string>} A promise that resolves to the unique identifier (UUID) of the newly created account.
   */
  async execute(command: CreateAccountCommand): Promise<string> {
    const { userId, accountType, currency, initialBalance } = command;

    const accountId = uuidv4();

    /**
     * The publisher.mergeObjectContext() method is a bridge between the write-side domain aggregate
     * and the event bus. It attaches an event-aware proxy to the aggregate, enabling event publication.
     */
    const account = this.publisher.mergeObjectContext(
      // The aggregate's constructor should only establish its identity.
      // All state changes must happen via methods that apply events.
      new Account(accountId),
    );

    // Delegate the core business logic to the aggregate root.
    // The `create` method will validate business rules and then apply an `AccountCreatedEvent`
    // to the aggregate's internal list of uncommitted events.
    account.create(userId, accountType, currency, initialBalance);

    /**
     * The repository is responsible for the atomicity of persisting events to the event store.
     * This is the "sourcing" part of Event Sourcing, saving the history of what happened.
     */
    await this.repository.save(account);

    /**
     * Once the events are safely stored, `commit()` publishes them to the event bus.
     * Other microservices or internal read-model projectors can then react to the `AccountCreatedEvent`.
     * This commit is what makes the state change "public" to the rest of the system.
     */
    account.commit();

    return accountId;
  }
}
