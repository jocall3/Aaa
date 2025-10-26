/**
 * @file index.tsx
 * @description Main entry point for the Transfer Funds Micro-Frontend.
 *
 * @module TransferFundsMF/EntryPoint
 *
 * @see {@link ./bootstrap.tsx} for the main application rendering and mounting logic.
 *
 * @summary
 * This file serves as the initial script executed for this micro-frontend. Its primary
 * responsibility is to dynamically and asynchronously import the `bootstrap.tsx` module.
 *
 * @architectural-decision
 * In a Webpack Module Federation setup, it is a critical pattern to have a lightweight,
 * asynchronous entry point like this one. This ensures that Webpack has the opportunity
 * to initialize the shared dependency scope and negotiate modules with the host application (shell)
 * *before* any of this micro-frontend's own application code (in `bootstrap.tsx`) is executed.
 *
 * Directly executing the main application logic (e.g., calling `ReactDOM.render`) in the entry
 * file can lead to race conditions where the micro-frontend attempts to use a shared dependency
 * (like React) that has not yet been loaded or initialized by the host. By using a dynamic `import()`,
 * we create an asynchronous boundary, guaranteeing that the federated module setup is complete
 * before the `mount` function in `bootstrap.tsx` is called.
 *
 * This pattern is a best practice for Module Federation and aligns with our architectural
 * directives for a composable micro-frontend architecture.
 *
 * @see ADR-007: "Frontend Module Federation Entry Point Strategy".
 */
import('./bootstrap');
');
');