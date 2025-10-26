# Stage 1: Build the Go application
# This stage uses a Go base image to build the application binary.
FROM golang:1.21-alpine AS builder

# Set the Current Working Directory inside the container
WORKDIR /app

# Install necessary build dependencies.
# git is required for downloading Go modules.
# ca-certificates is for secure connections.
RUN apk update && apk add --no-cache git ca-certificates

# Set environment variables for a static build, which is ideal for containers.
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

# Copy go.mod and go.sum files to leverage Docker's layer caching.
# Dependencies are only re-downloaded if these files change.
COPY go.mod go.sum ./

# Download Go module dependencies.
RUN go mod download

# Copy the entire source code into the container.
COPY . .

# Build the Go binary.
# We assume the main entrypoint of the service is in 'cmd/server'.
# -ldflags "-w -s" strips debug symbols and information, reducing the final binary size.
RUN go build -ldflags="-w -s" -o /payments-service ./cmd/server

# Stage 2: Create the final, minimal production image
# This stage starts from a minimal Alpine base image and copies the built binary.
FROM alpine:latest

# Install ca-certificates to allow for secure TLS/SSL connections to other services
# (e.g., Kafka, IAM, Vault, PostgreSQL) as per architectural directives.
RUN apk --no-cache add ca-certificates

# Create a non-root user and group for security best practices.
# Running as a non-root user reduces the potential impact of a container compromise.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set the working directory for the application.
WORKDIR /app

# Copy the static binary from the 'builder' stage.
COPY --from=builder /payments-service /app/payments-service

# Ensure the application binary is owned by the non-root user.
RUN chown -R appuser:appgroup /app

# Switch to the non-root user.
USER appuser

# Expose the port the service will run on. This should be configured in the application.
# As per standard microservice convention, we'll use 8080.
EXPOSE 8080

# Define the entrypoint for the container. This will run the application binary.
ENTRYPOINT ["/app/payments-service"]
