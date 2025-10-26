const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');

// In a real project, these versions would be sourced from package.json.
// They are hardcoded here to create a self-contained, runnable example.
const packageJsonDeps = {
  react: '^18.0.0',
  'react-dom': '^18.0.0',
  'react-router-dom': '^6.0.0',
  'styled-components': '^6.0.0'
};

/**
 * @file Webpack configuration for the Shell application.
 * @description This configuration sets up the main application shell for the micro-frontend architecture.
 * It uses Webpack Module Federation to consume remote micro-frontends (e.g., accounts, transfers)
 * and defines shared dependencies to be used across the entire application ecosystem, as per architectural directives.
 * TSDoc comments are included to align with the 'Docs-as-Code' mandate.
 */
module.exports = {
  entry: './src/index.ts',
  mode: process.env.NODE_ENV || 'development',

  /**
   * Configuration for the webpack-dev-server.
   */
  devServer: {
    // The port for the development server.
    port: 3000,
    open: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    // Enables client-side routing by redirecting all 404s to index.html.
    historyApiFallback: true,
  },

  /**
   * Defines the output configuration for the webpack bundle.
   */
  output: {
    // `publicPath: 'auto'` is crucial for Module Federation to dynamically determine asset paths.
    publicPath: 'auto',
    clean: true, // Clean the output directory before emit.
  },

  /**
   * Configuration for resolving module requests.
   */
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },

  /**
   * Defines how different types of modules within a project will be treated.
   */
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          presets: ['@babel/preset-react'],
        },
      },
      {
        test: /\.tsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          presets: [
            '@babel/preset-react',
            '@babel/preset-typescript',
          ],
        },
      },
      // Rule for handling images and other assets.
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },

  /**
   * Configuration for webpack plugins.
   */
  plugins: [
    /**
     * ModuleFederationPlugin configures this application as the 'shell' or 'host'
     * that will consume other micro-frontends (remotes).
     */
    new ModuleFederationPlugin({
      // A unique name for the shell application.
      name: 'shell',

      /**
       * Defines the remote micro-frontends that this shell can consume at runtime.
       * The key is the name used in imports (e.g., 'accounts/AccountListPage'),
       * and the value is the location of the remote's `remoteEntry.js` file.
       * These URLs would typically be managed via environment variables in a production setup.
       */
      remotes: {
        accounts: 'accounts@http://localhost:3001/remoteEntry.js',
        transfers: 'transfers@http://localhost:3002/remoteEntry.js',
        rewards: 'rewards@http://localhost:3003/remoteEntry.js',
        design_system: 'design_system@http://localhost:3004/remoteEntry.js',
      },

      /**
       * Defines shared dependencies between the shell and the remotes.
       * This ensures that only a single instance of these libraries is loaded,
       * reducing bundle size and preventing version conflicts.
       * Key libraries are marked as 'singleton' to enforce a single instance.
       */
      shared: {
        react: {
          singleton: true,
          requiredVersion: packageJsonDeps.react,
        },
        'react-dom': {
          singleton: true,
          requiredVersion: packageJsonDeps['react-dom'],
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: packageJsonDeps['react-router-dom'],
        },
        'styled-components': {
          singleton: true,
          requiredVersion: packageJsonDeps['styled-components'],
        },
      },
    }),

    /**
     * HtmlWebpackPlugin generates the main index.html file and injects the script tags
     * for the bundled application code, including the remoteEntry.js.
     */
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
};
