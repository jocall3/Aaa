# Stage 1: Build the application binary
# Use the official Go image as a builder to get the compiler and build tools.
FROM golang:1.21-alpine AS builder

# Set necessary environment variables
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

# Set the working directory inside the container
WORKDIR /app

# Install build dependencies that are not included in the base image.
# ca-certificates is needed for making HTTPS requests to download modules.
# git is needed for downloading modules from private Git repositories.
RUN apk add --no-cache ca-certificates git

# Copy go.mod and go.sum files to leverage Docker's layer caching.
# This allows us to only re-download dependencies if they have changed.
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the application source code into the container.
COPY . .

# Compile the Go application into a statically linked binary.
# Using -ldflags "-w -s" strips debug information, reducing the binary size.
RUN go build -ldflags="-w -s" -o /server ./cmd/server

# Stage 2: Create the final, minimal, and secure production image
# Use a distroless static image for a minimal footprint and reduced attack surface.
# It contains only our application, its runtime dependencies, and basic OS files.
FROM gcr.io/distroless/static-debian11

# Copy the compiled binary from the 'builder' stage.
COPY --from=builder /server /server

# Expose the port that the application will listen on. This is for documentation;
# the actual port mapping is configured at runtime (e.g., in Kubernetes).
# 8080 is a common port for HTTP services in a microservice architecture.
EXPOSE 8080

# Set the user to a non-root user for security. Distroless images handle this automatically.
# USER nonroot:nonroot

# Set the entrypoint for the container to run the application.
ENTRYPOINT ["/server"]
