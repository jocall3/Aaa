/**
 * @file Defines the standardized actions for the Federated State Bus.
 * @description All communication and state changes across micro-frontends and the
 * shell application must be performed by dispatching one of the actions defined
 * in this file. This ensures a consistent, predictable, and observable state
 * management layer as mandated by the federated state management architecture.
 *
 * Each action has a unique type and a strongly-typed payload. Action creator
 * functions are provided to ensure actions are created correctly.
 *
 * @see /docs/adr/ADR-008-federated-state-management.md
 * @module FederatedStateBus/Actions
 */

// --- Base Action Interface ---

/**
 * A generic interface for all actions that flow through the Federated State Bus.
 * @template T The type of the action's 'type' property (a string literal).
 * @template P The type of the action's 'payload' property.
 * @interface
 */
export interface Action<T extends string = string, P = any> {
  /**
   * A unique string literal that identifies the action.
   * This is used by reducers and streams to filter and handle specific actions.
   * @readonly
   * @type {T}
   */
  readonly type: T;

  /**
   * The data associated with the action. It is optional.
   * @readonly
   * @type {P | undefined}
   */
  readonly payload?: P;
}

// --- Payload Type Definitions ---
// In a real application, these might be imported from a shared types library.

/**
 * Represents the user's profile information.
 * @interface UserProfile
 */
export interface UserProfile {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

/**
 * Represents a summary of a bank account for list views.
 * @interface AccountSummary
 */
export interface AccountSummary {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
  readonly currency: string;
  readonly type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD';
}

/**
 * Represents a single financial transaction.
 * @interface Transaction
 */
export interface Transaction {
  readonly id: string;
  readonly accountId: string;
  readonly date: string;
  readonly description: string;
  readonly amount: number;
  readonly currency: string;
  readonly type: 'DEBIT' | 'CREDIT';
}

/**
 * Represents a standardized API error structure.
 * @interface ApiError
 */
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: any;
}

/**
 * Represents the payload for showing a UI notification.
 * @interface NotificationPayload
 */
export interface NotificationPayload {
  readonly id: string;
  readonly type: 'info' | 'success' | 'warning' | 'error';
  readonly title: string;
  readonly message: string;
  readonly duration?: number;
}

// --- Action Factory ---

/**
 * A factory function for creating actions with type-safe payloads.
 * @param {T} type - The unique action type string.
 * @param {P} payload - The data associated with the action.
 * @returns {Action<T, P>} A fully-formed action object.
 * @function
 */
function createAction<T extends string, P>(type: T, payload: P): Action<T, P>;
/**
 * A factory function for creating actions without payloads.
 * @param {T} type - The unique action type string.
 * @returns {Action<T, void>} A fully-formed action object.
 * @function
 */
function createAction<T extends string>(type: T, payload?: undefined): Action<T, void>;
function createAction<T extends string, P>(type: T, payload: P) {
  return { type, payload };
}

// --- Action Types and Creators ---

// User and Authentication Actions
export const USER_AUTHENTICATED = 'user/authenticated';
export const USER_PROFILE_LOADED = 'user/profileLoaded';
export const USER_LOGGED_OUT = 'user/loggedOut';

/** Creates an action indicating a user has successfully authenticated. */
export const userAuthenticated = (payload: { token: string; expiresAt: number }) =>
  createAction(USER_AUTHENTICATED, payload);
/** Creates an action indicating the authenticated user's profile has been loaded. */
export const userProfileLoaded = (payload: UserProfile) =>
  createAction(USER_PROFILE_LOADED, payload);
/** Creates an action indicating the user has logged out. */
export const userLoggedOut = () => createAction(USER_LOGGED_OUT);

// Account Domain Actions
export const ACCOUNTS_FETCH_REQUESTED = 'accounts/fetchRequested';
export const ACCOUNTS_FETCH_SUCCESS = 'accounts/fetchSuccess';
export const ACCOUNTS_FETCH_FAILURE = 'accounts/fetchFailure';
export const ACCOUNT_SELECTED = 'accounts/selected';

/** Creates an action to request fetching of all user accounts. */
export const fetchAccountsRequested = () => createAction(ACCOUNTS_FETCH_REQUESTED);
/** Creates an action for successfully fetched accounts. */
export const fetchAccountsSuccess = (payload: AccountSummary[]) =>
  createAction(ACCOUNTS_FETCH_SUCCESS, payload);
/** Creates an action for a failure in fetching accounts. */
export const fetchAccountsFailure = (payload: ApiError) =>
  createAction(ACCOUNTS_FETCH_FAILURE, payload);
/** Creates an action indicating a user has selected an account to view details. */
export const accountSelected = (payload: { accountId: string }) =>
  createAction(ACCOUNT_SELECTED, payload);

// Transaction Domain Actions
export const TRANSACTIONS_FETCH_REQUESTED = 'transactions/fetchRequested';
export const TRANSACTIONS_FETCH_SUCCESS = 'transactions/fetchSuccess';
export const TRANSACTIONS_FETCH_FAILURE = 'transactions/fetchFailure';

/** Creates an action to request fetching transactions for a specific account. */
export const fetchTransactionsRequested = (payload: { accountId: string; page: number; limit: number }) =>
  createAction(TRANSACTIONS_FETCH_REQUESTED, payload);
/** Creates an action for successfully fetched transactions. */
export const fetchTransactionsSuccess = (payload: { accountId: string; transactions: Transaction[] }) =>
  createAction(TRANSACTIONS_FETCH_SUCCESS, payload);
/** Creates an action for a failure in fetching transactions. */
export const fetchTransactionsFailure = (payload: ApiError) =>
  createAction(TRANSACTIONS_FETCH_FAILURE, payload);

// Transfer Domain Actions
export const TRANSFER_FUNDS_STARTED = 'transfer/fundsStarted';
export const TRANSFER_FUNDS_SUCCESS = 'transfer/fundsSuccess';
export const TRANSFER_FUNDS_FAILURE = 'transfer/fundsFailure';

/** Creates an action indicating a fund transfer has been initiated. */
export const transferFundsStarted = (payload: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
}) => createAction(TRANSFER_FUNDS_STARTED, payload);
/** Creates an action for a successful fund transfer. */
export const transferFundsSuccess = (payload: { transactionId: string; fromAccountId: string; toAccountId: string }) =>
  createAction(TRANSFER_FUNDS_SUCCESS, payload);
/** Creates an action for a failed fund transfer. */
export const transferFundsFailure = (payload: ApiError) =>
  createAction(TRANSFER_FUNDS_FAILURE, payload);

// UI / Shell Actions
export const NOTIFICATION_SHOW = 'ui/notificationShow';
export const NOTIFICATION_DISMISS = 'ui/notificationDismiss';

/** Creates an action to display a notification to the user. */
export const showNotification = (payload: NotificationPayload) =>
  createAction(NOTIFICATION_SHOW, payload);
/** Creates an action to dismiss a specific notification. */
export const dismissNotification = (payload: { id: string }) =>
  createAction(NOTIFICATION_DISMISS, payload);


// --- App Action Union Type ---

/**
 * A union type representing all possible actions that can be dispatched
 * on the Federated State Bus. Using a union type enables exhaustive type checking
 * in reducers and other action handlers like RxJS `ofType` operators.
 * @type
 */
export type AppAction =
  | ReturnType<typeof userAuthenticated>
  | ReturnType<typeof userProfileLoaded>
  | ReturnType<typeof userLoggedOut>
  | ReturnType<typeof fetchAccountsRequested>
  | ReturnType<typeof fetchAccountsSuccess>
  | ReturnType<typeof fetchAccountsFailure>
  | ReturnType<typeof accountSelected>
  | ReturnType<typeof fetchTransactionsRequested>
  | ReturnType<typeof fetchTransactionsSuccess>
  | ReturnType<typeof fetchTransactionsFailure>
  | ReturnType<typeof transferFundsStarted>
  | ReturnType<typeof transferFundsSuccess>
  | ReturnType<typeof transferFundsFailure>
  | ReturnType<typeof showNotification>
  | ReturnType<typeof dismissNotification>;
