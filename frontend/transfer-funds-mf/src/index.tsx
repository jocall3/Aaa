import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Mounts the TransferFunds micro-frontend into a specified DOM element.
 *
 * This function is the primary entry point for integrating this micro-frontend
 * into a host (shell) application. It encapsulates the rendering logic and provides
 * a cleanup mechanism to ensure proper lifecycle management within a larger
 * micro-frontend ecosystem. It uses React 18's createRoot API for concurrent rendering.
 *
 * @public
 * @function mount
 * @param {Element} el - The HTML DOM element where the React application will be rendered.
 * @returns {{ onUnmount: () => void }} An object containing a function to unmount the application,
 * allowing the host to clean up resources when this micro-frontend is no longer needed.
 */
const mount = (el: Element) => {
  const root = ReactDOM.createRoot(el);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  return {
    /**
     * Unmounts and cleans up the React component from the provided DOM element.
     *
     * This function is returned by `mount` and should be invoked by the host application
     * when the micro-frontend needs to be removed from the view, ensuring that all
     * React-managed resources and event listeners are properly disposed of.
     * @public
     * @function onUnmount
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
 * unique DOM element (e.g., '#_transfer-funds-dev-root') which is expected
 * to exist in the `index.html` of this micro-frontend's standalone development
 * server. If found, it immediately mounts the application, enabling isolated
 * development and testing without needing the full shell application.
 * This entire block is tree-shaken and removed from production builds.
 */
if (process.env.NODE_ENV === 'development') {
  const devRoot = document.querySelector('#_transfer-funds-dev-root');

  if (devRoot) {
    // We are running in isolation, call mount immediately.
    mount(devRoot);
  }
}

/**
 * Export the mount function, making it the public API of this micro-frontend
 * for consumption by a host application through Module Federation.
 */
export { mount };
