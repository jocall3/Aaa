# Dockerfile for the Policy Enforcement Service (OPA)
#
# This file defines the container image for the centralized authorization service,
# which is built on the Open Policy Agent (OPA).
#
# As per the architectural directive "Centralize Authorization with an External
# Policy Enforcement Service", this service is responsible for making all
# fine-grained authorization decisions for the microservices platform.

# Use a specific, recent, and stable version of the official OPA image for production.
# The slim variant is smaller and has a reduced attack surface.
FROM openpolicyagent/opa:0.62.1-slim

# The official OPA image already sets a non-root user, which aligns with
# our security best practices.

# Copy the authorization policies and any static data into a designated directory
# within the container. The OPA server will be configured to load all policy and
# data files from this location.
# We assume a 'policies' directory exists at the root of this service's source code,
# containing all Rego (*.rego) policies and any necessary data files (*.json).
COPY ./policies /app/policies

# Expose the port OPA listens on for API requests. The default port is 8181.
# This port will be used by the API gateway or service mesh to query for authorization decisions.
EXPOSE 8181

# Define the command to start the OPA server.
# It's configured to:
# - Run in server mode ('run --server') to listen for API requests.
# - Load all policy and data files from the /app/policies directory.
# - Set a log level. 'info' is a sensible default for production environments.
# - Set a structured logging format for better observability and integration with log aggregators.
# - Listen on all network interfaces within the container on the exposed port.
CMD ["run", "--server", "--addr", ":8181", "--log-level", "info", "--log-format", "json", "/app/policies"]
