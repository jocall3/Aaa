# =================================================================
# Dockerfile for the UI Composition Service
#
# This Dockerfile follows a multi-stage build pattern to create a
# minimal, secure, and optimized container image for the service.
# This service is responsible for serving declarative UI layouts to the
# frontend shell, as per the Backend-Driven UI Composition directive.
#
# Stage 1: Build
#   - Uses a secure Node.js Alpine base image.
#   - Caches Node.js module dependencies for faster subsequent builds.
#   - Compiles TypeScript source code into JavaScript.
#
# Stage 2: Final
#   - Uses a lightweight Node.js Alpine image for production.
#   - Installs only production dependencies to minimize image size.
#   - Copies compiled code from the build stage.
#   - Runs the application as a non-root user ('appuser') for enhanced
#     security, adhering to the principle of least privilege.
# =================================================================

# ---- STAGE 1: Build ----
# This stage installs all dependencies (including devDependencies) and builds the application.
FROM node:20.11.1-alpine3.19 AS builder

LABEL maintainer="Elite AI Implementation Team"

# Set the working directory in the container
WORKDIR /usr/src/app

# Tini is a lightweight init system that properly handles signals and zombie processes.
RUN apk add --no-cache tini

# Copy package.json and package-lock.json to leverage Docker cache layers
COPY package*.json ./

# Install all dependencies, including dev dependencies for building
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Compile TypeScript to JavaScript. The output will be in the 'dist' directory.
RUN npm run build


# ---- STAGE 2: Production ----
# This stage creates the final, lightweight, and secure image for production.
FROM node:20.11.1-alpine3.19 AS production

# Set the environment to production to ensure optimal performance and security settings.
ENV NODE_ENV=production

# Set the working directory
WORKDIR /usr/src/app

# Install Tini init system.
RUN apk add --no-cache tini

# Create a non-root user and group for security best practices.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies for a smaller, more secure image.
RUN npm ci --only=production

# Copy the compiled application code from the builder stage.
COPY --from=builder /usr/src/app/dist ./dist

# Change the ownership of the application files to the non-root user.
RUN chown -R appuser:appgroup /usr/src/app

# Switch to the non-root user.
USER appuser

# Expose the port the application will listen on. This should be configured
# via environment variables in the running container.
EXPOSE 8080

# Use Tini as the entrypoint to manage the Node.js process correctly.
ENTRYPOINT ["/sbin/tini", "--"]

# Define the command to start the application.
CMD ["node", "dist/main.js"]