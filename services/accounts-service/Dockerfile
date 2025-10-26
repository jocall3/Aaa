# Stage 1: Builder/Development Stage
# This stage installs all dependencies (including devDependencies) and builds the application.
FROM node:20.11.1-alpine3.19 AS builder

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

# Generate Prisma client if it's used (common in Node.js microservices)
# This is a placeholder; uncomment or adapt if another ORM or client is used.
# RUN npx prisma generate

# Compile TypeScript to JavaScript. The output will be in the 'dist' directory.
RUN npm run build

# Remove development dependencies to lighten the next stage if we were to copy node_modules
# Instead, we will do a clean production install in the final stage.

# Stage 2: Production Stage
# This stage creates the final, lightweight, and secure image for production.
FROM node:20.11.1-alpine3.19 AS production

# Set the environment to production
ENV NODE_ENV=production

# Set the working directory
WORKDIR /usr/src/app

# Tini is a lightweight init system that properly handles signals and zombie processes.
RUN apk add --no-cache tini

# Create a non-root user and group for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies for a smaller image size
RUN npm ci --only=production

# Copy the compiled application code from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy Prisma schema if it exists, for the runtime client
# COPY --from=builder /usr/src/app/prisma ./prisma

# Change the ownership of the application files to the non-root user
RUN chown -R appuser:appgroup /usr/src/app

# Switch to the non-root user
USER appuser

# Expose the port the application will listen on
# This should match the port configured in the application (e.g., via environment variables)
EXPOSE 8080

# Use Tini as the entrypoint to manage the Node.js process
ENTRYPOINT ["/sbin/tini", "--"]

# Define the command to start the application
CMD ["node", "dist/main.js"]