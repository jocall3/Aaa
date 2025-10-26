/**
 * @file Main entry point for the IAM (Identity and Access Management) microservice.
 * @description This service acts as a central OAuth 2.1 / OIDC provider for the entire platform.
 * It is responsible for user authentication, issuing JWTs, service-to-service authentication,
 * and managing access control policies. It uses the 'oidc-provider' library and a PostgreSQL backend.
 * @version 1.0.0
 * @module IamService
 */

import 'dotenv/config';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { Provider, Configuration, Account } from 'oidc-provider';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import pino from 'pino';
import pinoHttp from 'pino-http';

const logger = pino({ level: process.env.LOG_LEVEL || 'info', transport: { target: 'pino-pretty' } });

// --- Configuration --- 
const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  issuer: process.env.ISSUER || 'http://localhost:3002',
  postgres: {
    connectionString: process.env.IAM_DATABASE_URL || 'postgresql://iam_user:iam_password@localhost:5432/iam_db',
  },
  cookies: {
    long: { signed: true, maxAge: 24 * 60 * 60 * 1000 }, // 1 day in ms
    short: { signed: true },
    keys: process.env.COOKIE_KEYS ? process.env.COOKIE_KEYS.split(',') : ['some-long-secret-for-cookie-signing'],
  },
};

// --- Persistence Adapters ---

/**
 * @class UserService
 * @description A simple service to manage user accounts in the PostgreSQL database.
 * In a real application, this would be a more robust repository pattern implementation.
 */
class UserService {
  /**
   * @param {Pool} db - The PostgreSQL connection pool.
   */
  constructor(private db: Pool) {}

  /**
   * Finds a user by their email and verifies their password.
   * @param {string} email - The user's email.
   * @param {string} password - The user's plain-text password.
   * @returns {Promise<any | null>} The user record if credentials are valid, otherwise null.
   */
  async findByCredentials(email: string, password: string): Promise<any | null> {
    const { rows } = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (user && (await bcrypt.compare(password, user.password_hash))) {
      return user;
    }
    return null;
  }

  /**
   * Finds a user by their ID.
   * @param {string} id - The user's unique ID.
   * @returns {Promise<any | null>} The user record if found, otherwise null.
   */
  async findById(id: string): Promise<any | null> {
    const { rows } = await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

/**
 * @class AccountService
 * @description Implements the `findAccount` logic required by oidc-provider.
 */
class AccountService {
  /**
   * Finds a user account and prepares it for the OIDC provider.
   * @param {object} _ctx - The OIDC context.
   * @param {string} id - The user ID (subject).
   * @returns {Promise<Account | undefined>} An OIDC-compatible account object.
   */
  static async findAccount(_ctx: unknown, id: string): Promise<Account | undefined> {
    const user = await userService.findById(id);
    if (!user) {
      return undefined;
    }

    return {
      accountId: user.id,
      async claims() {
        return {
          sub: user.id,
          email: user.email,
          email_verified: user.email_verified,
          given_name: user.first_name,
          family_name: user.last_name,
        };
      },
    };
  }
}

// --- OIDC Provider Setup ---

const oidcConfig: Configuration = {
  adapter: (name: string) => ({ // A simple in-memory adapter for demonstration. A DB adapter is needed for production.
    name,
    async upsert(id, payload, expiresIn) {
      // In a real app, this would use a database.
    },
    async find(id) { return undefined; },
    async findByUserCode(userCode) { return undefined; },
    async findByUid(uid) { return undefined; },
    async destroy(id) {},
    async revokeByGrantId(grantId) {},
    async consume(id) {},
  }),
  clients: [
    {
      client_id: 'test_client',
      client_secret: 'test_secret',
      grant_types: ['authorization_code', 'refresh_token'],
      redirect_uris: ['https://jwt.io', 'http://localhost:3000/callback'],
      response_types: ['code'],
    },
  ],
  cookies: config.cookies,
  pkce: {
    required: () => false, // Set to true in production for public clients
  },
  claims: {
    openid: ['sub'],
    email: ['email', 'email_verified'],
    profile: ['given_name', 'family_name'],
  },
  features: {
    devInteractions: { enabled: false }, // Disable dev interactions for custom UI
    deviceFlow: { enabled: true },
    revocation: { enabled: true },
  },
  jwks: {
    keys: [
      {
        d: 'VEZOsY07JTFzGT7JqL3EcOkd_RR_4So7_EaGmmDRGr1iS13h2kM5w2_VqC6n_2e4u6nLpS2aY_2n_f9j-K-8d_f',
        dp: 'VEZOsY07JTFzGT7JqL3EcOkd_RR_4So7_EaGmmDRGr1iS13h2kM5w2_VqC6n_2e4u6nLpS2aY_2n_f9j-K-8d_f',
        dq: 'VEZOsY07JTFzGT7JqL3EcOkd_RR_4So7_EaGmmDRGr1iS13h2kM5w2_VqC6n_2e4u6nLpS2aY_2n_f9j-K-8d_f',
        e: 'AQAB',
        kty: 'RSA',
        n: 'p-VEZOsY07JTFzGT7JqL3EcOkd_RR_4So7_EaGmmDRGr1iS13h2kM5w2_VqC6n_2e4u6nLpS2aY_2n_f9j-K-8d_f',
        p: 'VEZOsY07JTFzGT7JqL3EcOkd_RR_4So7_EaGmmDRGr1iS13h2kM5w2_VqC6n_2e4u6nLpS2aY_2n_f9j-K-8d_f',
        q: 'VEZOsY07JTFzGT7JqL3EcOkd_RR_4So7_EaGmmDRGr1iS13h2kM5w2_VqC6n_2e4u6nLpS2aY_2n_f9j-K-8d_f',
        qi: 'VEZOsY07JTFzGT7JqL3EcOkd_RR_4So7_EaGmmDRGr1iS13h2kM5w2_VqC6n_2e4u6nLpS2aY_2n_f9j-K-8d_f',
      },
    ],
  },
  findAccount: AccountService.findAccount,
};

// --- Application Bootstrap ---

let dbPool: Pool;
let userService: UserService;

/**
 * @function bootstrap
 * @description Initializes and starts the IAM service application.
 * @returns {Promise<http.Server>}
 */
async function bootstrap(): Promise<http.Server> {
  logger.info('IAM Service: Bootstrapping...');

  // 1. Initialize Database
  dbPool = new Pool({ connectionString: config.postgres.connectionString });
  dbPool.on('error', (err) => logger.error(err, 'Unexpected error on idle client'));
  await dbPool.query('SELECT NOW()');
  logger.info('IAM Service: PostgreSQL connection established.');
  userService = new UserService(dbPool);

  // 2. Initialize OIDC Provider
  const provider = new Provider(config.issuer, oidcConfig);

  // 3. Initialize Express App
  const app: Express = express();
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(express.urlencoded({ extended: true }));
  app.set('trust proxy', 'loopback');

  // Health check endpoint
  app.get('/health', (req, res) => res.status(200).json({ status: 'UP' }));

  // OIDC Interaction Routes
  app.use('/interaction/:uid', async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      const { uid, prompt, params } = details;

      if (prompt.name === 'login') {
        return res.send(`
          <h1>Login</h1>
          <form method="post" action="/interaction/${uid}/login">
            <input type="email" name="email" placeholder="Enter your email" value="test@example.com"><br>
            <input type="password" name="password" placeholder="Enter your password" value="password"><br>
            <button type="submit">Sign-in</button>
          </form>
        `);
      }

      return res.send(`
        <h1>Consent</h1>
        <p>Client ${params.client_id} wants to access your data.</p>
        <form method="post" action="/interaction/${uid}/confirm">
          <button type="submit">Allow</button>
        </form>
      `);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/interaction/:uid/login', async (req, res, next) => {
    try {
      const { uid } = req.params;
      const { email, password } = req.body;
      const account = await userService.findByCredentials(email, password);
      
      if (!account) {
        res.send(`<h1>Invalid credentials</h1><a href="/interaction/${uid}">Try again</a>`);
        return;
      }

      const result = { login: { accountId: account.id } };
      await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
    } catch (err) {
      next(err);
    }
  });

  app.post('/interaction/:uid/confirm', async (req, res, next) => {
    try {
      const result = { consent: { grantId: '' } }; // grantId will be generated by the provider
      await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: true });
    } catch (err) {
      next(err);
    }
  });

  // Mount OIDC provider
  app.use('/', provider.callback());

  // Centralized Error Handling (placeholder for shared error framework)
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error({ err, req }, 'An unhandled error occurred');
    if (!res.headersSent) {
      res.status(500).json({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' });
    }
  });
  
  const server = http.createServer(app);
  
  return new Promise((resolve, reject) => {
    server.listen(config.port, () => {
      logger.info(`IAM Service: Server is running on port ${config.port}`);
      logger.info(`IAM Service: OIDC discovery URL: ${config.issuer}/.well-known/openid-configuration`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// --- Main Execution with Graceful Shutdown ---

if (require.main === module) {
  bootstrap().then(server => {
    const shutdown = async (signal: string) => {
      logger.warn(`IAM Service: Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        if (dbPool) await dbPool.end();
        logger.info('IAM Service: Shutdown complete.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }).catch(err => {
    logger.fatal({ err }, 'IAM Service: Failed to bootstrap');
    process.exit(1);
  });
}
