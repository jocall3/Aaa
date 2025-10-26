# =================================================================
# Dockerfile for the Identity and Access Management (IAM) Service
#
# This Dockerfile follows a multi-stage build pattern to create a
# minimal, secure, and optimized container image for the IAM service.
#
# Stage 1: Build
#   - Uses a Golang Alpine image for a lightweight build environment.
#   - Caches Go module dependencies for faster subsequent builds.
#   - Compiles the Go application into a single, statically-linked
#     binary, stripped of debug symbols for a smaller size.
#
# Stage 2: Final
#   - Uses a "distroless" static image from Google as the base.
#     This image contains only the bare necessities to run a static
#     binary (like CA certificates), significantly reducing the
#     attack surface and aligning with our Zero Trust security model.
#   - Runs the application as a non-root user ('nonroot') for
#     enhanced security.
#   - Exposes the standard service port and sets the entrypoint.
# =================================================================

# ---- STAGE 1: Build ----
# Use an official Golang Alpine image as a builder environment. Alpine is chosen
# for its small size, which speeds up the CI/CD pipeline.
FROM golang:1.21-alpine AS build

# Set the maintainer label
LABEL maintainer="Elite AI Implementation Team"

# Set the working directory inside the container. All subsequent commands
# will be run from this directory.
WORKDIR /app

# Copy the Go module files to leverage Docker's layer caching.
# This step is done separately from copying the full source code, so that
# dependencies are only re-downloaded when go.mod or go.sum changes.
COPY go.mod go.sum ./

# Download Go module dependencies.
RUN go mod download

# Copy the rest of the application's source code into the container.
COPY . .

# Compile the Go application into a statically-linked binary.
# - CGO_ENABLED=0: Disables CGO to produce a static binary without C library dependencies.
# - GOOS=linux: Specifies the target operating system.
# - -a: Forces rebuilding of packages that are already up-to-date.
# - -ldflags="-w -s": Strips debugging information and the symbol table from the binary,
#   reducing its size.
# - -o /iam-service: Specifies the output file path for the compiled binary.
RUN CGO_ENABLED=0 GOOS=linux go build -a -ldflags="-w -s" -o /iam-service .


# ---- STAGE 2: Final ----
# Use a "distroless" static image as the final base image. It contains the bare
# minimum to run a static binary (e.g., glibc, CA certificates), providing a
# minimal attack surface in production.
FROM gcr.io/distroless/static-debian12

# Copy the compiled binary from the 'build' stage into the final image.
COPY --from=build /iam-service /iam-service

# Expose the port the service will listen on for API requests.
# The actual port mapping will be handled by the container orchestration platform (e.g., Kubernetes).
EXPOSE 8080

# Run the container as a non-root user for security. UID 65532 is the standard
# 'nonroot' user in distroless images.
USER 65532:65532

# Set the entrypoint for the container to run the compiled service binary.
ENTRYPOINT ["/iam-service"]
