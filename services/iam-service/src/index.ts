/**
 * @fileoverview Main entry point for the IAM (Identity and Access Management) microservice.
 * This service acts as a central OAuth 2.1 / OIDC provider for the entire platform.
 * It is responsible for user authentication, issuing JWTs, service-to-service authentication,
 * and managing access control policies.
 * @version 1.0.0
 */

// Import necessary Node.js and third-party modules.
import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';

// As per the Hexagonal Architecture, we import ports and adapters.
// These are placeholder imports as the actual files would be generated elsewhere.
import { ILoggerPort } from './ports/logger.port';
import { ConsoleLoggerAdapter } from './adapters/secondary/logger/console-logger.adapter';
import { VaultAdapter } from './adapters/secondary/vault/vault.adapter';
import { ISecretStorePort } from './ports/secret-store.port';
import { createApiRouter } from './adapters/primary/http/api.router';
import { AppConfig, loadConfig } from './config';
import { DatabaseAdapter } from './adapters/secondary/database/database.adapter';
import { IDatabasePort } from './ports/database.port';

/**
 * Main application class for the IAM service.
 * Encapsulates the Express server and all its dependencies, following the composition root pattern.
 * @class IamApplication
 */
class IamApplication {
    /**
     * The Express application instance.
     * @private
     * @type {Express}
     */
    private readonly app: Express;

    /**
     * The HTTP server instance.
     * @private
     * @type {http.Server}
     */
    private server!: http.Server;

    /**
     * The application configuration.
     * @private
     * @type {AppConfig}
     */
    private readonly config: AppConfig;

    /**
     * The logger instance, implementing the logger port.
     * @private
     * @type {ILoggerPort}
     */
    private readonly logger: ILoggerPort;

    /**
     * The secret store adapter for HashiCorp Vault.
     * @private
     * @type {ISecretStorePort}
     */
    private readonly secretStore: ISecretStorePort;
    
    /**
     * The database adapter.
     * @private
     * @type {IDatabasePort}
     */
    private readonly database: IDatabasePort;

    /**
     * Constructs the IamApplication instance.
     * This is where the application's dependency graph is composed.
     * @constructor
     */
    constructor() {
        this.logger = new ConsoleLoggerAdapter();
        this.logger.info('IAM Service: Initializing application...');

        this.config = loadConfig();
        this.app = express();

        // Instantiate secondary adapters (driven side)
        this.secretStore = new VaultAdapter(this.config.vault, this.logger);
        this.database = new DatabaseAdapter(this.config.database, this.logger);

        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandling();
    }

    /**
     * Configures the core Express middleware.
     * @private
     */
    private configureMiddleware(): void {
        this.logger.info('IAM Service: Configuring middleware...');
        this.app.use(helmet());
        this.app.use(cors(this.config.cors));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Simple request logger middleware
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            this.logger.info(`Incoming request: ${req.method} ${req.originalUrl}`);
            next();
        });
    }

    /**
     * Configures the API routes by instantiating the primary HTTP adapter.
     * @private
     */
    private configureRoutes(): void {
        this.logger.info('IAM Service: Configuring API routes...');
        // The primary adapter (driving side) for HTTP is the API router.
        // We inject the necessary dependencies (core services, which in turn use secondary adapters).
        const apiRouter = createApiRouter({
            logger: this.logger,
            secretStore: this.secretStore,
            database: this.database,
            config: this.config
            // Other core services would be instantiated and passed here
        });
        this.app.use('/api/iam/v1', apiRouter);

        // Health check endpoint
        this.app.get('/health', (req: Request, res: Response) => {
            res.status(200).json({ status: 'UP' });
        });
    }

    /**
     * Configures centralized error handling middleware.
     * @private
     */
    private configureErrorHandling(): void {
        this.logger.info('IAM Service: Configuring error handling...');
        // 404 handler for routes not found
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.status(404).json({
                error: {
                    type: 'NotFound',
                    message: `Resource not found at ${req.method} ${req.originalUrl}`,
                },
            });
        });

        // Global error handler
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            this.logger.error('An unhandled error occurred:', err);
            // In production, we would not send the stack trace
            const isProduction = this.config.nodeEnv === 'production';
            res.status(500).json({
                error: {
                    type: 'InternalServerError',
                    message: isProduction ? 'An unexpected error occurred.' : err.message,
                    stack: isProduction ? undefined : err.stack,
                },
            });
        });
    }

    /**
     * Starts the IAM service application.
     * It initializes dependencies like the secret store and database connection,
     * then starts the HTTP server.
     * @public
     * @returns {Promise<void>}
     */
    public async start(): Promise<void> {
        try {
            this.logger.info('IAM Service: Starting application...');
            // Initialize asynchronous dependencies
            await this.secretStore.initialize();
            this.logger.info('IAM Service: Secret store initialized.');
            await this.database.connect();
            this.logger.info('IAM Service: Database connection established.');

            this.server = this.app.listen(this.config.port, () => {
                this.logger.info(`IAM Service: Server is running on port ${this.config.port}`);
                this.logger.info(`IAM Service: Current environment is ${this.config.nodeEnv}`);
            });
        } catch (error) {
            this.logger.error('IAM Service: Failed to start application', error);
            process.exit(1);
        }
    }
    
    /**
     * Stops the application gracefully.
     * @public
     * @returns {Promise<void>}
     */
    public async stop(): Promise<void> {
        this.logger.info('IAM Service: Stopping application...');
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close(async (err) => {
                    if (err) {
                        this.logger.error('IAM Service: Error during server shutdown', err);
                        return reject(err);
                    }
                    try {
                        await this.database.disconnect();
                        this.logger.info('IAM Service: Database connection closed.');
                    } catch (dbError) {
                        this.logger.error('IAM Service: Error closing database connection', dbError);
                    }
                    this.logger.info('IAM Service: Server has been shut down gracefully.');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

/**
 * Bootstraps and runs the IAM service application.
 * This self-invoking function handles the main execution flow and graceful shutdown.
 */
(async () => {
    const app = new IamApplication();
    
    await app.start();

    const shutdown = async (signal: string) => {
        console.info(`IAM Service: Received ${signal}. Starting graceful shutdown...`);
        try {
            await app.stop();
            process.exit(0);
        } catch (error) {
            console.error('IAM Service: Graceful shutdown failed', error);
            process.exit(1);
        }
    };

    // Listen for shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
})();
