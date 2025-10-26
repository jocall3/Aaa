/**
 * @fileoverview Main entry point for the Federated State Bus library.
 * @description Implements a unified, observable state layer for communication
 * between micro-frontends and the shell, based on RxJS. As per the architectural
 * directive for Federated State Management, this library provides the core
 * mechanism for decoupled state sharing.
 * @see /docs/adr/ADR-012-federated-state-management.md
 * @module FederatedStateBus
 */

import {
  BehaviorSubject,
  Observable,
  Subject,
  distinctUntilChanged,
  map,
  scan,
  shareReplay,
} from 'rxjs';

/**
 * @interface Action
 * @description Defines the structure for a federated action object. All state changes
 * must be initiated by dispatching an object that conforms to this interface.
 * The `type` property is a string that uniquely identifies the action,
 * and the `payload` is an optional property that carries the data for the state change.
 *
 * @template T The type of the payload.
 * @example
 * ```ts
 * const userLoggedInAction: Action<{ userId: string; name: string }> = {
 *   type: '[User] Logged In',
 *   payload: { userId: '123', name: 'Jane Doe' }
 * };
 * ```
 */
export interface Action<T = any> {
  /**
   * A string that serves as the unique identifier for the action.
   * By convention, it's often formatted as `[Domain] Action Description`.
   * @type {string}
   * @example '[Accounts] Set Selected Account'
   */
  readonly type: string;

  /**
   * The optional data payload associated with the action.
   * @type {T}
   */
  readonly payload?: T;
}

/**
 * @type {State}
 * @description Represents the global, federated state tree of the application.
 * It is a key-value store where each key typically corresponds to a state "slice"
 * managed by a particular domain or micro-frontend.
 */
export type State = Record<string, any>;

/**
 * @type {Reducer<S, A>}
 * @description A function that takes the current state and an action, and returns the next state.
 * Reducers must be pure functions, meaning they do not have side effects and return
 * a new state object instead of mutating the existing one.
 *
 * @template S The type of the state slice this reducer operates on.
 * @template A The type of the action.
 * @param {S} state - The current state slice.
 * @param {A} action - The action being dispatched.
 * @returns {S} The new state slice.
 */
export type Reducer<S, A extends Action = Action> = (state: S, action: A) => S;

/**
 * @class FederatedStateBus
 * @description A singleton class that implements a global, observable state bus using RxJS.
 * It provides a centralized mechanism for micro-frontends and the shell to share state
 * and communicate via a structured action-dispatching pattern.
 *
 * This class is the core implementation of the "Federated State Bus" architectural directive.
 *
 * @example
 * ```ts
 * // Get the singleton instance
 * const stateBus = FederatedStateBus.getInstance();
 *
 * // Define a reducer for a state slice (should handle undefined initial state)
 * const accountsReducer = (state = { selected: null }, action) => {
 *   switch (action.type) {
 *     case '[Accounts] Set Selected Account':
 *       return { ...state, selected: action.payload };
 *     default:
 *       return state;
 *   }
 * };
 *
 * // Register the reducer from a micro-frontend or the shell
 * stateBus.registerReducer('accounts', accountsReducer);
 *
 * // Subscribe to state changes from another micro-frontend
 * const selectedAccount$ = stateBus.select(state => state.accounts.selected);
 * selectedAccount$.subscribe(selectedId => console.log('Selected account changed:', selectedId));
 *
 * // Dispatch an action from anywhere in the application
 * stateBus.dispatch({ type: '[Accounts] Set Selected Account', payload: 'acc-123' });
 * // Console output: "Selected account changed: acc-123"
 * ```
 */
export class FederatedStateBus {
  /**
   * The singleton instance of the FederatedStateBus.
   * @private
   * @static
   */
  private static instance: FederatedStateBus;

  /**
   * A multicasting observable that holds the single source of truth for the application state.
   * It emits the current state to all new subscribers.
   * @private
   */
  private readonly _state$: BehaviorSubject<State>;

  /**
   * An observable stream of all actions dispatched in the application.
   * @private
   */
  private readonly _action$: Subject<Action> = new Subject<Action>();

  /**
   * A map of reducer functions, keyed by the state slice they manage.
   * @private
   */
  private readonly _reducers: Record<string, Reducer<any, Action>> = {};

  /**
   * The public-facing observable of the application state.
   * @public
   */
  public readonly state$: Observable<State>;

  /**
   * The private constructor for the singleton pattern. It sets up the main state stream by
   * piping actions through a master reducer composed of all registered slice reducers.
   * @private
   * @param {State} [initialState={}] - The initial state of the application.
   */
  private constructor(initialState: State = {}) {
    this._state$ = new BehaviorSubject<State>(initialState);
    this.state$ = this._state$.asObservable().pipe(
      // shareReplay ensures that late subscribers get the last emitted state
      // and that the upstream observable is shared among all subscribers.
      shareReplay(1)
    );

    this._action$
      .pipe(
        scan((state: State, action: Action) => this.masterReducer(state, action), initialState)
      )
      .subscribe(this._state$);
  }

  /**
   * The master reducer function that composes all registered slice reducers.
   * It iterates over each registered reducer, applies it to its corresponding state slice,
   * and returns the new composite state, preserving non-reducer-managed state slices.
   * @private
   * @param {State} state - The current global state.
   * @param {Action} action - The action being dispatched.
   * @returns {State} The new global state.
   */
  private masterReducer(state: State, action: Action): State {
    const nextState: State = { ...state };
    let hasChanged = false;

    for (const sliceName in this._reducers) {
      if (Object.prototype.hasOwnProperty.call(this._reducers, sliceName)) {
        const previousSliceState = state[sliceName];
        const nextSliceState = this._reducers[sliceName](previousSliceState, action);
        if (previousSliceState !== nextSliceState) {
          hasChanged = true;
        }
        nextState[sliceName] = nextSliceState;
      }
    }

    return hasChanged ? nextState : state;
  }

  /**
   * Retrieves the singleton instance of the FederatedStateBus.
   * @public
   * @static
   * @param {State} [initialState={}] - The initial state, only used on the first call.
   * @returns {FederatedStateBus} The single instance of the state bus.
   */
  public static getInstance(initialState: State = {}): FederatedStateBus {
    if (!FederatedStateBus.instance) {
      FederatedStateBus.instance = new FederatedStateBus(initialState);
    }
    return FederatedStateBus.instance;
  }

  /**
   * Registers a reducer function for a specific slice of the global state.
   * This allows micro-frontends to define their own state management logic in a decoupled way.
   * If a reducer for the given slice name already exists, it will be overwritten.
   * @public
   * @param {string} sliceName - The key for the state slice to be managed by this reducer.
   * @param {Reducer<any, Action>} reducer - The reducer function for this state slice.
   * @throws {Error} If the sliceName or reducer is invalid.
   * @example
   * ```ts
   * const authReducer = (state, action) => { ... };
   * FederatedStateBus.getInstance().registerReducer('auth', authReducer);
   * ```
   */
  public registerReducer(sliceName: string, reducer: Reducer<any, Action>): void {
    if (!sliceName || typeof sliceName !== 'string') {
      throw new Error('[FederatedStateBus] Invalid sliceName provided to registerReducer.');
    }
    if (!reducer || typeof reducer !== 'function') {
      throw new Error(`[FederatedStateBus] Invalid reducer provided for slice '${sliceName}'.`);
    }
    this._reducers[sliceName] = reducer;
    // Dispatch a special action to initialize the state for this new reducer
    this.dispatch({ type: `@[FederatedStateBus] Reducer Registered - ${sliceName}` });
  }

  /**
   * Dispatches an action to the state bus. The action will be processed by all
   * registered reducers, potentially leading to a new state.
   * @public
   * @param {Action} action - The action object to dispatch.
   * @throws {Error} If the action is not a valid object with a 'type' property.
   * @example
   * ```ts
   * stateBus.dispatch({ type: '[User] Logout' });
   * ```
   */
  public dispatch(action: Action): void {
    if (!action || typeof action.type !== 'string') {
      console.error('[FederatedStateBus] Invalid action dispatched. Action must be an object with a `type` property.', action);
      throw new Error('Invalid action format. Action must be an object with a `type` property.');
    }
    this._action$.next(action);
  }

  /**
   * Selects a slice of the state and returns it as an observable stream.
   * The stream only emits new values when the selected state has actually changed.
   * @public
   * @template T - The type of the selected state slice.
   * @param {(state: State) => T} selector - A pure function to select a part of the state.
   * @returns {Observable<T>} An observable that emits the selected state slice whenever it changes.
   * @example
   * ```ts
   * const user$ = stateBus.select(state => state.auth.user);
   * user$.subscribe(user => console.log(user));
   * ```
   */
  public select<T>(selector: (state: State) => T): Observable<T> {
    return this.state$.pipe(
      map(selector),
      distinctUntilChanged()
    );
  }

  /**
   * Retrieves a snapshot of the current global state.
   * Note: It is highly recommended to use `select` and subscribe to state changes
   * reactively rather than relying on synchronous snapshots.
   * @public
   * @returns {State} The current global state object.
   */
  public getState(): State {
    return this._state$.getValue();
  }
}

/**
 * A pre-initialized, exported singleton instance of the FederatedStateBus.
 * This is the primary export that most of the application will interact with.
 *
 * @const {FederatedStateBus} federatedStateBus
 */
export const federatedStateBus = FederatedStateBus.getInstance();
