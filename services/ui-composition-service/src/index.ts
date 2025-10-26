import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pino from 'pino';

/**
 * @fileoverview Main entry point for the UI Composition Service.
 * @description This service is the cornerstone of the "Backend-Driven UI Composition"
 * architectural directive. It serves a declarative JSON payload that instructs the
 * frontend shell on how to compose a page by dynamically rendering specified micro-frontends
 * into designated layout slots with the necessary configuration.
 * @module UICompositionService
 * @version 1.0.0
 */

// --- Payload Type Definitions ---

/**
 * @interface ComponentConfig
 * @description Defines the configuration for a single micro-frontend component to be rendered.
 * @property {string} remote - The name of the remote module federation container (e.g., 'accounts', 'transfers').
 * @property {string} module - The exposed module within the remote (e.g., './AccountListApp').
 * @property {Record<string, any>} [props] - The properties to be passed to the micro-frontend component.
 */
interface ComponentConfig {
  remote: string;
  module: string;
  props?: Record<string, any>;
}

/**
 * @interface SlotConfig
 * @description Defines a slot within a layout and the components that should be rendered inside it.
 * @property {string} id - The unique identifier for the slot (e.g., 'main-content', 'sidebar').
 * @property {ComponentConfig[]} components - An array of micro-frontend components to render in this slot.
 */
interface SlotConfig {
  id: string;
  components: ComponentConfig[];
}

/**
 * @interface LayoutPayload
 * @description Represents the complete declarative UI composition payload for a given page.
 * This object is served to the frontend shell to dynamically construct the user interface.
 * @property {string} layout - The name of the shell layout template to use (e.g., 'DashboardLayout', 'TwoColumnLayout').
 * @property {SlotConfig[]} slots - The configuration for the content of each slot in the layout.
 * @property {{ title: string; description?: string }} meta - Metadata for the page, such as the document title.
 */
interface LayoutPayload {
  layout: string;
  slots: SlotConfig[];
  meta: {
    title: string;
    description?: string;
  };
}

// --- Mock Layout Service ---
// In a production environment, this service would fetch layouts from a persistent store
// like a database, a CMS, or a Git-backed repository of YAML/JSON files. It would
// contain sophisticated logic for A/B testing, personalization, and feature flagging.

/**
 * A simple in-memory store for page layout definitions, acting as a mock database.
 * @private
 * @type {Record<string, LayoutPayload>}
 */
const layouts: Record<string, LayoutPayload> = {
  'dashboard': {
    layout: 'DashboardLayout',
    meta: { title: 'My Dashboard' },
    slots: [
      {
        id: 'main-content',
        components: [
          { remote: 'account_list_mf', module: './AccountListApp', props: { title: 'My Accounts' } },
          { remote: 'transaction_history_mf', module: './TransactionHistoryApp', props: { accountId: 'default', limit: 10 } },
        ]
      },
      {
        id: 'sidebar',
        components: [
          { remote: 'transfer_funds_mf', module: './TransferFundsApp', props: { variant: 'quick' } }
        ]
      }
    ]
  },
  'transfers': {
    layout: 'SingleColumnLayout',
    meta: { title: 'Transfer Funds' },
    slots: [
      {
        id: 'main-content',
        components: [
          { remote: 'transfer_funds_mf', module: './TransferFundsApp', props: { variant: 'full' } }
        ]
      }
    ]
  },
  'account-details': {
    layout: 'TwoColumnLayout',
    meta: { title: 'Account Details' },
    slots: [
      {
        id: 'left-column',
        components: [
          // The accountId prop is intentionally left null; it will be dynamically injected.
          { remote: 'account_list_mf', module: './AccountDetailView', props: { accountId: null } }
        ]
      },
      {
        id: 'right-column',
        components: [
          { remote: 'transaction_history_mf', module: './TransactionHistoryApp', props: { accountId: null, limit: 20 } }
        ]
      }
    ]
  }
};

/**
 * A mock service to retrieve layout configurations.
 * @class LayoutService
 */
class LayoutService {
  /**
   * Fetches the layout payload for a given page name and context.
   * @param {string} pageName - The identifier for the page (e.g., 'dashboard').
   * @param {object} context - Request context (e.g., user roles, A/B test groups).
   * @returns {Promise<LayoutPayload | null>} The layout payload or null if not found.
   */
  public async getLayoutForPage(pageName: string, context: { userRole?: string, abGroup?: string }): Promise<LayoutPayload | null> {
    const baseLayout = layouts[pageName];
    if (!baseLayout) {
      return null;
    }
    
    // Deep copy to avoid mutating the original layout definition.
    const layout: LayoutPayload = JSON.parse(JSON.stringify(baseLayout));

    // Example of personalization based on user role.
    if (pageName === 'dashboard' && context.userRole === 'admin') {
      layout.slots.find(s => s.id === 'sidebar')?.components.push({
        remote: 'admin_tools_mf', module: './AdminDashboardWidget', props: {}
      });
    }

    return layout;
  }
}

/**
 * Main application bootstrapping function.
 * @async
 * @function bootstrap
 * @description Initializes the service, sets up the server, and starts listening for requests.
 */
async function bootstrap(): Promise<void> {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  });

  const server: FastifyInstance = Fastify({ logger });
  const layoutService = new LayoutService();
  const PORT = parseInt(process.env.PORT || '3005', 10); // Using a unique port for this new service

  // --- Primary Adapter: HTTP API ---

  server.get('/health', async (_, reply) => {
    reply.code(200).send({ status: 'ok', service: 'ui-composition-service' });
  });

  /**
   * @route GET /v1/layouts/:pageName
   * @description Fetches the declarative UI composition payload for a specific page.
   * This endpoint is the core of the Backend-Driven UI Composition pattern.
   * @param {string} pageName - The unique name of the page layout to retrieve.
   * @header {string} [x-user-role] - The role of the user, used for personalization.
   * @header {string} [x-ab-group] - The A/B test group for the user.
   */
  server.get('/v1/layouts/:pageName', async (
    request: FastifyRequest<{ 
      Params: { pageName: string },
      Querystring: { [key: string]: string },
      Headers: { 'x-user-role'?: string, 'x-ab-group'?: string } 
    }>,
    reply: FastifyReply
  ) => {
    const { pageName } = request.params;
    const userRole = request.headers['x-user-role'];
    const abGroup = request.headers['x-ab-group'];

    try {
      const layoutPayload = await layoutService.getLayoutForPage(pageName, { userRole, abGroup });

      if (layoutPayload) {
        // Dynamically inject properties from query parameters into component props.
        // This allows passing context like `accountId` from the URL to the micro-frontends.
        if (request.query) {
          layoutPayload.slots.forEach(slot => {
            slot.components.forEach(component => {
              if (component.props) {
                Object.keys(component.props).forEach(propKey => {
                  if (request.query[propKey] !== undefined) {
                    component.props![propKey] = request.query[propKey];
                  }
                });
              }
            });
          });
        }
        
        return reply.code(200).send(layoutPayload);
      } else {
        return reply.code(404).send({ error: 'LayoutNotFound', message: `No layout definition found for page: ${pageName}` });
      }
    } catch (error) {
      server.log.error(error, `Error fetching layout for page: ${pageName}`);
      return reply.code(500).send({ error: 'InternalServerError', message: 'An error occurred while fetching the layout.' });
    }
  });

  // --- Server Startup ---

  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // --- Graceful Shutdown ---

  const shutdown = async (signal: string) => {
    logger.warn(`Received ${signal}. Shutting down UI Composition Service gracefully...`);
    await server.close();
    logger.info('Server closed.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Run the application
bootstrap();
