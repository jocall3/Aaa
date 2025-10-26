# =================================================================
# Dockerfile for the Saga Orchestrator Service
#
# Aligns with the architectural directive to implement a dedicated
# Saga Orchestrator for managing distributed transactions. This service
# is responsible for interpreting Saga State Machine definitions (ASL)
# and coordinating steps across multiple microservices.
#
# This Dockerfile uses a multi-stage build pattern to create a
# minimal, secure, and optimized container image for production.
# =================================================================

# ---- STAGE 1: Builder ----
# This stage compiles the TypeScript application and installs all dependencies.
FROM node:20.11.1-alpine3.19 AS builder

LABEL maintainer="Elite AI Implementation Team"
LABEL service="saga-orchestrator-service"

# Use tini as a lightweight init system for proper signal handling.
RUN apk add --no-cache tini

WORKDIR /usr/src/app

# Copy dependency manifests to leverage Docker cache layers.
COPY package*.json ./

# Install all dependencies, including devDependencies for the build process.
RUN npm ci

# Copy the rest of the application source code.
COPY . .

# This service centrally manages Saga definitions written in Amazon States Language (ASL).
# Ensure these definitions are included in the image so the orchestrator can load them at runtime.
# It is assumed that saga definitions are located in a 'sagas' directory.
COPY sagas ./sagas

# Build the TypeScript application into JavaScript.
RUN npm run build

# ---- STAGE 2: Production ----
# This stage creates the final, lightweight production image.
FROM node:20.11.1-alpine3.19 AS production

# Set the environment to production for performance and security optimizations.
ENV NODE_ENV=production

# Use tini as the entrypoint to manage the Node.js process correctly.
RUN apk add --no-cache tini

# Create a non-root user and group for security best practices.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /usr/src/app

# Copy dependency manifests.
COPY package*.json ./

# Install only production dependencies to minimize image size and attack surface.
RUN npm ci --only=production

# Copy compiled application code and runtime assets from the builder stage.
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/sagas ./sagas

# Change ownership of the application files to the non-root user.
RUN chown -R appuser:appgroup /usr/src/app

# Switch to the non-root user.
USER appuser

# Expose the port the application will listen on. This will be mapped by the container orchestrator (e.g., Kubernetes).
EXPOSE 8080

# Use Tini as the entrypoint to ensure proper PID 1 behavior (signal forwarding, reaping zombies).
ENTRYPOINT ["/sbin/tini", "--"]

# Define the command to start the application.
CMD ["node", "dist/main.js"]