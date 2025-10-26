import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';

/**
 * @file This file is the entry point for the Transaction History Micro-frontend.
 * It provides a `mount` function to render the application into a host DOM element,
 * allowing it to be dynamically loaded by the container shell application. It also
 * includes logic to run the micro-frontend in isolation during development.
 * This setup is a core part of the Micro-Frontends architecture using Module Federation.
 *
 * @see /docs/adr/ADR-005-micro-frontend-architecture.md
 * @module TransactionHistoryMF/Index
 */

/**
 * Mounts the Transaction History micro-frontend's root React component into a specified DOM element.
 * This function is exported and consumed by the container application (shell) at runtime to
 * dynamically load and render this micro-frontend into its designated placeholder. It follows
 * the standard Port/Adapter pattern for UI adapters in the Hexagonal Architecture, where the
 * container application provides the DOM element (the "port") and this function adapts the
 * React application to it.
 *
 * @public
 * @function mount
 * @param {Element} el - The DOM element into which the React application will be rendered.
 * @param {object} [initialProps={}] - An object containing initial properties passed from the container,
 * such as authentication tokens, user information, or routing callbacks.
 * @returns {void}
 */
const mount = (el: Element, initialProps: object = {}): void => {
  ReactDOM.render(<App {...initialProps} />, el);
};

/**
 * Development-specific logic to run the micro-frontend in isolation.
 * This block checks if the application is running in a development environment and
 * looks for a specific root DOM element (`_transaction-history-dev-root`). If found,
 * it immediately calls the `mount` function to render the application, facilitating
 * independent development and testing without needing the full container shell.
 *
 * @private
 */
if (process.env.NODE_ENV === 'development') {
  const devRoot = document.getElementById('_transaction-history-dev-root');

  if (devRoot) {
    // When running in isolation, we can pass mock properties for development.
    mount(devRoot, { isStandalone: true });
  }
}

/**
 * The `mount` function is exported, making it the public contract for this micro-frontend.
 * The container application will import and call this function to integrate the
 * Transaction History feature into the main application shell.
 *
 * @public
 */
export { mount };
