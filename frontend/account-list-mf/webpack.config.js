/**
 * @file Webpack configuration for the Account List Micro-Frontend.
 * @description This configuration sets up a development server and builds the micro-frontend
 *              bundle using Webpack Module Federation. It exposes the main application
 *              component and defines shared dependencies to be consumed by the shell application.
 * @licence Apache-2.0
 */

const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');

/**
 * @description Defines the dependencies that will be shared between this micro-frontend and the host application.
 *              Sharing dependencies is crucial for performance and to ensure that singleton libraries like React
 *              are only loaded once on the page.
 */
const sharedDependencies = {
  react: { singleton: true, requiredVersion: '^18.0.0' },
  'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
  'react-router-dom': { singleton: true, requiredVersion: '^6.0.0' },
  '@mui/material': { singleton: true, requiredVersion: '^5.0.0' },
  '@emotion/react': { singleton: true, requiredVersion: '^11.0.0' },
  '@emotion/styled': { singleton: true, requiredVersion: '^11.0.0' },
};

module.exports = {
  /**
   * The entry point of the application. Webpack begins its bundling process from here.
   */
  entry: './src/index',

  /**
   * The mode determines which optimizations Webpack uses.
   * 'development' focuses on fast builds and helpful debugging.
   */
  mode: 'development',

  /**
   * Configuration for the webpack-dev-server, used for local development.
   */
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    port: 3001, // Unique port for the Account List MFE to avoid conflicts
    headers: {
      // Required headers for Cross-Origin Resource Sharing (CORS) to allow the shell app
      // to fetch this MFE's resources (like remoteEntry.js).
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
  },

  /**
   * Specifies how the output files should be generated.
   */
  output: {
    // 'auto' is crucial for Module Federation to determine the public path at runtime.
    publicPath: 'auto',
    // Cleans the /dist folder before each build, so that only used files will be generated.
    clean: true,
  },

  /**
   * Configuration for how modules are resolved.
   */
  resolve: {
    // Allows importing modules without specifying their extensions.
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },

  /**
   * Defines the rules for how different types of modules will be treated.
   */
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              // Use the automatic runtime for React 17+ to avoid manual React imports.
              ['@babel/preset-react', { runtime: 'automatic' }],
              '@babel/preset-typescript',
            ],
          },
        },
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },

  /**
   * An array of plugins used to enhance Webpack's functionality.
   */
  plugins: [
    /**
     * The core of the Micro-Frontends architecture. This plugin makes this application
     * a "remote" that can be consumed by a "host" (the shell application).
     */
    new ModuleFederationPlugin({
      // A unique name for this micro-frontend.
      name: 'account_list_mf',
      // The name of the manifest file that the host will use to discover the exposed modules.
      filename: 'remoteEntry.js',
      /**
       * Modules that this micro-frontend makes available to the host application.
       * The key is the alias the host will use, and the value is the path to the module.
       * A 'bootstrap.tsx' file is used to handle asynchronous loading of dependencies.
       */
      exposes: {
        './AccountListApp': './src/bootstrap.tsx',
      },
      /**
       * Dependencies that are shared with other micro-frontends and the host.
       * This avoids duplication and ensures single instances of important libraries like React.
       */
      shared: sharedDependencies,
    }),

    /**
     * Generates an HTML file to serve the webpack bundle. This is useful for
     * developing and testing the micro-frontend in isolation.
     */
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
};
