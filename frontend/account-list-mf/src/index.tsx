/**
 * @file This file is the entry point for the AccountList micro-frontend.
 * It is responsible for dynamically importing the main application bootstrap file.
 * This pattern is used to support Webpack Module Federation, allowing the
 * micro-frontend to be loaded asynchronously by the shell application
 * without immediately executing the render logic.
 * @see ./bootstrap.tsx for the main application rendering logic.
 * @see TSDoc conventions: https://tsdoc.org/
 */
import('./bootstrap');
