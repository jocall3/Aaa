/**
 * @file index.ts
 * @description Main entry point for the Micro-Frontend Shell application.
 *
 * @module Shell/EntryPoint
 *
 * @see {@link ./bootstrap.tsx} for the main application rendering logic.
 *
 * @summary
 * This file serves as the initial script executed when the shell application is loaded.
 * Its primary and sole responsibility is to dynamically import the `bootstrap.tsx` module.
 *
 * @architectural-decision
 * In a Webpack Module Federation architecture, it is a critical pattern to have a lightweight,
 * asynchronous entry point (`index.ts`). This approach ensures that Webpack has the opportunity
 * to initialize the shared scope and negotiate dependencies with any remote micro-frontends
 * *before* any of the shell's own application code (in `bootstrap.tsx`) is executed.
 *
 * Executing the main application logic directly in the entry file can lead to race conditions
 * where the application attempts to use a shared dependency that has not yet been loaded from a
 * remote container. By using a dynamic `import()`, we create an asynchronous boundary,
 * guaranteeing that the federated module setup is complete before bootstrapping the React application.
 *
 * This pattern is mandated by our "Deconstruct the Frontend into a Composable Micro-Frontends
 * Architecture" directive and is a best practice for Module Federation.
 *
 * @see ADR-007: "Frontend Module Federation Entry Point Strategy".
 */

import("./bootstrap");
