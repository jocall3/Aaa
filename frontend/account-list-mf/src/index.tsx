import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * @file This file is the entry point for the Account List Micro-frontend.
 * @description In alignment with the federated architecture, this file provides a `mount`
 * function to render the application into a host DOM element. This allows it to be
 * dynamically loaded and controlled by the shell application. It also includes logic to run
 * the micro-frontend in isolation for development and testing purposes.
 * @module AccountListMF/EntryPoint
 */

/**
 * Mounts the Account List micro-frontend into a specified DOM element.
 *
 * This function is the primary contract for integrating this micro-frontend
 * into a host (shell) application. It encapsulates the rendering logic using React 18's
 * createRoot API and provides a cleanup mechanism (`onUnmount`) to ensure proper lifecycle
 * management within the larger micro-frontend ecosystem.
 *
 * The `initialProps` parameter is crucial for integrating with the shell, allowing for the
 * injection of shared services like the `FederatedStateBus`, authentication tokens, and
 * configuration from the `UICompositionService`.
 *
 * @public
 * @function mount
 * @param {Element} el - The HTML DOM element where the React application will be rendered.
 * @param {object} [initialProps={}] - An object containing initial properties and services passed from the shell.
 * @returns {{ onUnmount: () => void }} An object containing a function to unmount the application,
 * allowing the host to clean up resources when this micro-frontend is no longer needed.
 * @example
 * // In the shell application:
 * import { mount } from 'accountList/AccountListApp';
 * const { onUnmount } = mount(document.getElementById('account-list-root'), { federatedStateBus, authToken });
 * // Later, to clean up:
 * onUnmount();
 */
const mount = (el: Element, initialProps: object = {}) => {
  const root = ReactDOM.createRoot(el);
  root.render(
    <React.StrictMode>
      <App {...initialProps} />
    </React.StrictMode>
  );

  return {
    /**
     * Unmounts and cleans up the React component from the provided DOM element.
     *
     * This function is returned by `mount` and should be invoked by the host application
     * when the micro-frontend needs to be removed from the view. This ensures all
     * React-managed resources, state subscriptions, and event listeners are properly disposed of,
     * preventing memory leaks.
     * @public
     * @function onUnmount
     * @returns {void}
     */
    onUnmount: () => {
      root.unmount();
    },
  };
};

/**
 * Standalone Development Execution Block
 *
 * This logic runs only in a 'development' environment. It searches for a
 * unique DOM element (`#_account-list-dev-root`) which is expected
 * to exist in this micro-frontend's standalone `public/index.html`.
 * If found, it immediately mounts the application, enabling isolated
 * development and testing without needing the full shell application.
 * This entire block is tree-shaken and removed from production builds.
 *
 * @private
 */
if (process.env.NODE_ENV === 'development') {
  const devRoot = document.querySelector('#_account-list-dev-root');

  if (devRoot) {
    // When running in isolation, we can pass mock properties for development.
    mount(devRoot, { isStandalone: true });
  }
}

/**
 * Export the mount function, making it the public API of this micro-frontend
 * for consumption by a host application through Module Federation.
 * @public
 */
export { mount };
