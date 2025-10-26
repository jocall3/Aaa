const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const path = require("path");

/**
 * @type {import('webpack').Configuration}
 * @description Webpack configuration for the Transfer Funds micro-frontend.
 * This configuration uses Webpack Module Federation to expose the application
 * so it can be dynamically loaded into the main shell application. It also defines
 * shared dependencies to prevent duplication and ensure consistency across the
 * micro-frontend ecosystem.
 */
module.exports = {
  entry: "./src/index",
  mode: "development",

  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    port: 3003, // Unique port for the Transfer Funds micro-frontend
    historyApiFallback: true, // Necessary for client-side routing
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization",
    },
  },

  output: {
    publicPath: "auto", // Automatically determine the public path for chunks
    clean: true, // Clean the output directory before each build
  },

  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },

  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        loader: "babel-loader",
        exclude: /node_modules/,
        options: {
          presets: [
            "@babel/preset-env",
            ["@babel/preset-react", { runtime: "automatic" }],
            "@babel/preset-typescript",
          ],
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: "asset/resource",
      },
    ],
  },

  plugins: [
    new ModuleFederationPlugin({
      name: "transfer_funds_mf",
      filename: "remoteEntry.js",
      exposes: {
        // Exposes the bootstrap file that mounts the main React component
        "./TransferFundsApp": "./src/bootstrap",
      },
      remotes: {
        // Consumes the shell application for shared context, services, etc.
        shell: "shell@http://localhost:3000/remoteEntry.js",
        // Consumes the shared design system and component library
        component_library: "component_library@http://localhost:3005/remoteEntry.js",
      },
      shared: {
        // Libraries shared with other micro-frontends
        react: {
          singleton: true, // Only one instance of react
          eager: true, // Load it eagerly
        },
        "react-dom": {
          singleton: true, // Only one instance of react-dom
          eager: true, // Load it eagerly
        },
        "react-router-dom": {
          singleton: true, // Only one instance of react-router-dom
        },
        // This should align with the component library's styling solution
        "styled-components": {
          singleton: true,
        },
      },
    }),
    new HtmlWebpackPlugin({
      // Uses the public/index.html as a template for the app's entry point
      template: "./public/index.html",
    }),
  ],
};
