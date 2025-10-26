const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');
const deps = require('./package.json').dependencies;

/**
 * @file Webpack configuration for the Transaction History Micro-Frontend.
 * @description This configuration sets up a development server and builds the micro-frontend
 * as a remote module for Webpack Module Federation. It exposes the main application
 * component and defines shared dependencies to be consumed by the shell application.
 * Adheres to the Micro-Frontends architecture directive.
 */
module.exports = {
  entry: './src/index',
  mode: 'development',

  /**
   * Configuration for the webpack-dev-server.
   * Serves the micro-frontend in isolation on a unique port and sets up
   * necessary headers for CORS to allow the shell application to fetch it.
   */
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    port: 3003, // Unique port for the transaction history micro-frontend
    historyApiFallback: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
  },

  /**
   * Output configuration for the bundled code.
   * 'publicPath: "auto"' is crucial for Module Federation to dynamically determine asset paths.
   */
  output: {
    publicPath: 'auto',
    chunkFilename: '[id].[contenthash].js',
    clean: true, // Clean the output directory before emit.
  },

  /**
   * Resolution configuration for module imports.
   * Allows importing TypeScript and JavaScript files without specifying extensions.
   */
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },

  /**
   * Module rules for processing different file types.
   * Includes Babel for transpiling TypeScript/JavaScript.
   */
  module: {
    rules: [
      {
        test: /bootstrap\.tsx?$/,
        loader: 'bundle-loader',
        options: {
          lazy: true,
        },
      },
      {
        test: /\.jsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          presets: ['@babel/preset-env', '@babel/preset-react'],
        },
      },
      {
        test: /\.tsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          presets: [
            '@babel/preset-env',
            '@babel/preset-react',
            '@babel/preset-typescript',
          ],
        },
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },

  /**
   * Webpack plugins for extending build capabilities.
   * - ModuleFederationPlugin: Configures the micro-frontend as a 'remote'.
   * - HtmlWebpackPlugin: Generates an HTML file to serve the MFE for standalone development.
   */
  plugins: [
    new ModuleFederationPlugin({
      // A unique name for this micro-frontend
      name: 'transactionHistory',
      // The name of the remote entry file that the shell will use to load this MFE
      filename: 'remoteEntry.js',
      // The modules that this MFE will expose to the shell application
      exposes: {
        './TransactionHistoryApp': './src/bootstrap',
      },
      // Dependencies to be shared with the shell and other micro-frontends
      shared: {
        ...deps,
        react: {
          singleton: true,
          requiredVersion: deps.react,
        },
        'react-dom': {
          singleton: true,
          requiredVersion: deps['react-dom'],
        },
        // As per architecture, the shared Design System component library would be included here
        // e.g., '@elite-bank/design-system': { singleton: true, requiredVersion: deps['@elite-bank/design-system'] }
      },
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      chunks: ['main'],
    }),
  ],
};
