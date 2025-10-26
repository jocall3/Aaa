import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Subject } from 'rxjs';

import App from './App';
// Assuming a CSS file for basic styling exists.
import './index.css';

/**
 * @file This file is the entry point for the Transaction History Micro-frontend.
 * It provides a `mount` function to render the application into a host DOM element,
 * allowing it to be dynamically loaded by the container shell application. It also
 * includes logic to run the micro-frontend in isolation during development.
 *
 * @architectural-directive This component has been refactored to integrate with the
 * `Federated State Bus`. It no longer accepts arbitrary initial props, but instead
 * receives an instance of the state bus for all communication, and a config object
 * from the UI Composition Service.
 *
 * @see ADR-009: "Backend-Driven UI Composition and Federated State Management"
 * @module TransactionHistoryMF/Index
 */

/**
 * A simplified representation of the Federated State Bus interface, based on RxJS.
 * In the actual implementation, this would be imported from a shared library
 * (`@libs/federated-state-bus`).
 * @interface FederatedStateBus
 */
export interface FederatedStateBus {
  /**
   * Dispatches an action object to the state bus.
   * @param {object} action - A structured action with a type and optional payload.
   * @returns {void}
   */
  dispatch: (action: { type: string; payload?: any }) => void;
  /**
   * An RxJS Subject representing the stream of state updates from the bus.
   * Components subscribe to this to receive new state.
   * @type {Subject<any>}
   */
  state$: Subject<any>;
}

/**
 * Defines the properties required to mount the Transaction History micro-frontend.
 * @interface MountProps
 */
export interface MountProps {
  /**
   * An instance of the federated state bus for all cross-MFE communication.
   * @type {FederatedStateBus}
   */
  federatedStateBus: FederatedStateBus;
  /**
   * Initial configuration for this micro-frontend, typically driven by the
   * UI Composition Service.
   * @type {Record<string, unknown>}
   */
  config: Record<string, unknown>;
}


/**
 * Mounts the Transaction History micro-frontend into a specified DOM element.
 *
 * This function is the primary entry point for integrating this micro-frontend
 * into a host (shell) application. It encapsulates the rendering logic and provides
 * a cleanup mechanism to ensure proper lifecycle management. It uses React 18's
 * `createRoot` API for concurrent rendering.
 *
 * @public
 * @function mount
 * @param {Element} el - The HTML DOM element where the React application will be rendered.
 * @param {MountProps} props - The properties required for mounting, including the state bus and config.
 * @returns {{ onUnmount: () => void }} An object containing a function to unmount the application,
 * allowing the host to clean up resources when this micro-frontend is no longer needed.
 */
const mount = (el: Element, { federatedStateBus, config }: MountProps) => {
  const root: Root = createRoot(el);
  root.render(
    <React.StrictMode>
      <App federatedStateBus={federatedStateBus} config={config} />
    </React.StrictMode>
  );

  return {
    /**
     * Unmounts and cleans up the React component from the provided DOM element.
     * This should be invoked by the host application when the micro-frontend is removed.
     * @public
     * @function onUnmount
     */
    onUnmount: () => {
      root.unmount();
    },
  };
};

/**
 * Development-specific logic to run the micro-frontend in isolation.
 * This block checks if the application is running in a development environment and
 * looks for a specific root DOM element (`_transaction-history-dev-root`). If found,
 * it immediately calls the `mount` function with a mock state bus to render the
 * application, facilitating independent development and testing.
 *
 * @private
 */
if (process.env.NODE_ENV === 'development') {
  const devRoot = document.getElementById('_transaction-history-dev-root');

  if (devRoot) {
    // Create a mock state bus for isolated development.
    const mockStateBus: FederatedStateBus = {
      dispatch: (action) => console.log('[MockFederatedStateBus] Dispatched:', action),
      state$: new Subject<any>(),
    };
    
    // Simulate some state being pushed from the bus.
    setTimeout(() => {
        mockStateBus.state$.next({
            user: { id: 'dev-user-123', name: 'Dev User' },
            selectedAccount: { id: 'acc-standalone-456', balance: 1000 },
        });
    }, 1000);

    mount(devRoot, { 
        federatedStateBus: mockStateBus, 
        config: { isStandalone: true, title: 'Transaction History (Standalone)' } 
    });
  }
}

/**
 * The `mount` function is exported, making it the public API of this micro-frontend
 * for consumption by a host application through Module Federation.
 * @public
 */
export { mount };
