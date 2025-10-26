# =================================================================
# Dockerfile for the Web Application Backend-for-Frontend (BFF)
#
# This Dockerfile follows a multi-stage build pattern to create a
# minimal, secure, and optimized container image for the BFF service.
# This aligns with the architectural directive to introduce a GraphQL-based BFF layer.
#
# Stage 1: Builder
#   - Uses a Node.js Alpine image for a lightweight build environment.
#   - Caches Node module dependencies for faster subsequent builds.
#   - Compiles the TypeScript source code into JavaScript.
#
# Stage 2: Production
#   - Starts from a fresh, lightweight Node.js Alpine image.
#   - Creates a non-root user for enhanced security.
#   - Installs only production dependencies to minimize image size.
#   - Copies the compiled application code and necessary assets from
#     the builder stage.
#   - Sets the entrypoint to 'tini' for proper signal handling.
# =================================================================

# ---- STAGE 1: Builder ----
# Use a specific, secure version of the Node.js Alpine image for a consistent build environment.
FROM node:20.11.1-alpine3.19 AS builder

# Set the working directory inside the container.
WORKDIR /usr/src/app

# Tini is a lightweight init system that properly handles signals and zombie processes.
# Useful for running Node.js in a container as PID 1.
RUN apk add --no-cache tini

# Copy package.json and package-lock.json to leverage Docker's layer caching.
# Dependencies are only re-installed if these files change.
COPY package*.json ./

# Install all dependencies, including development dependencies needed for the build.
# 'npm ci' is used for deterministic builds based on the lock file.
RUN npm ci

# Copy the rest of the application's source code.
COPY . .

# Compile the TypeScript application to JavaScript.
# The output will be in the 'dist' directory as per tsconfig.json.
RUN npm run build

# ---- STAGE 2: Production ----
# Start from a fresh, lightweight base image to create the final production image.
FROM node:20.11.1-alpine3.19 AS production

# Set the environment to production to enable optimizations in Node.js and libraries.
ENV NODE_ENV=production

# Set the working directory for the application.
WORKDIR /usr/src/app

# Install Tini.
RUN apk add --no-cache tini

# Create a non-root user and group for security, following the principle of least privilege.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy package files to install only production dependencies.
COPY package*.json ./

# Install only production dependencies to keep the final image size minimal.
RUN npm ci --only=production

# Copy the compiled application code from the 'builder' stage.
COPY --from=builder /usr/src/app/dist ./dist

# The BFF is GraphQL-based. Copy any GraphQL schema files that are needed at runtime.
# This assumes schema files are located alongside source and copied to dist during build.
# If they are in a different location, adjust the path accordingly.
COPY --from=builder /usr/src/app/src/**/*.graphql ./dist/

# Change the ownership of the application files to the non-root user.
RUN chown -R appuser:appgroup /usr/src/app

# Switch to the non-root user for running the application.
USER appuser

# Expose the port that the BFF service will listen on.
# This port should be configured via environment variables for flexibility.
# For consistency with other backend services, we'll use 8080.
EXPOSE 8080

# Use Tini as the entrypoint to properly manage the Node.js process as PID 1.
ENTRYPOINT ["/sbin/tini", "--"]

# Define the command to start the application.
# This should point to the main entry file of the compiled JavaScript application.
CMD ["node", "dist/main.js"]