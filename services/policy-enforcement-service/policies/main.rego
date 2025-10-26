package policy.authz

#
# This is the main policy file for the centralized Policy Enforcement Service.
# It uses the Open Policy Agent (OPA) and its Rego language to make authorization decisions
# for all incoming API requests across the microservices platform.
#
# Architectural Directive: Centralize Authorization with an External Policy Enforcement Service
#
# This policy adheres to a "default deny" posture. A request is only allowed if one or more
# of the 'allow' rules explicitly evaluate to true.
#

# By default, all requests are denied.
default allow = false

# --- Input Helpers ---
# Provides convenient aliases for accessing parts of the input document.
# This assumes the API Gateway provides a structured input to OPA, for example:
# {
#   "service": "accounts-service",
#   "method": "GET",
#   "path": ["v1", "accounts", "acc-123"],
#   "user": {
#     "id": "user-456",
#     "roles": ["customer"]
#   },
#   "body": { ... } // for POST/PUT/PATCH
# }
method := input.method
path := input.path
user_id := input.user.id
roles := { role | role := input.user.roles[_] }
service := input.service

# --- Top-Level Routing ---
# The main 'allow' rule delegates to service-specific rule sets based on the
# 'service' field in the input. This keeps policies modular and organized.

allow {
    # 1. Allow public endpoints that do not require authentication.
    is_public_endpoint
}

allow {
    # 2. Delegate to rules for the 'accounts-service'.
    service == "accounts-service"
    allow_accounts_service
}

allow {
    # 3. Delegate to rules for the 'payments-service'.
    service == "payments-service"
    allow_payments_service
}

allow {
    # 4. A global administrative override for any action.
    "admin" in roles
}

# --- Public Endpoints ---
# These endpoints are accessible by any caller, authenticated or not.
is_public_endpoint {
    # All services must expose a health check endpoint at /health.
    path[count(path)-1] == "health"
    method == "GET"
}


#-------------------------------------------------
# Policy: accounts-service
#-------------------------------------------------
# Fine-grained authorization rules for the Accounts microservice.
# The path is expected to start with ["v1", "accounts", ...].

# Rule: Customers can list their own accounts.
# The service is responsible for filtering the results to only this user's accounts.
# API: GET /v1/accounts
allow_accounts_service {
    path[0] == "v1"; path[1] == "accounts"
    method == "GET"
    count(path) == 2
    "customer" in roles
}

# Rule: Customers can perform actions on accounts they own.
# This is a data-driven policy. The 'data.accounts' document must be provided to OPA,
# mapping account IDs to their owner IDs. Example: data.accounts = {"acc-123": {"owner_id": "user-456"}}
allow_accounts_service {
    path[0] == "v1"; path[1] == "accounts"
    account_id := path[2]

    "customer" in roles
    data.accounts[account_id].owner_id == user_id

    # Allowed actions for account owners.
    # GET    /v1/accounts/{accountId}
    # PATCH  /v1/accounts/{accountId}
    # GET    /v1/accounts/{accountId}/transactions
    # POST   /v1/accounts/{accountId}/deposits
    # POST   /v1/accounts/{accountId}/withdrawals
    method in {"GET", "PATCH", "POST"}
}

# Rule: 'support' agents can view account details and transaction history for any account.
allow_accounts_service {
    path[0] == "v1"; path[1] == "accounts"
    _ := path[2] # Ensure an accountId is present in the path

    "support" in roles
    method == "GET"
    support_can_view_account_resource(path)
}

# Helper: Determines which account resources a support agent can view.
support_can_view_account_resource(path) {
    # GET /v1/accounts/{accountId}
    count(path) == 3
}
support_can_view_account_resource(path) {
    # GET /v1/accounts/{accountId}/transactions
    count(path) == 4
    path[3] == "transactions"
}


#-------------------------------------------------
# Policy: payments-service
#-------------------------------------------------
# Fine-grained authorization rules for the Payments microservice.
# The path is expected to start with ["v1", "payments", ...].

# Rule: Customers can initiate payments from an account they own.
# API: POST /v1/payments
allow_payments_service {
    path[0] == "v1"; path[1] == "payments"
    count(path) == 2
    method == "POST"
    "customer" in roles
    
    # Data-driven check: The user must own the source account specified in the request body.
    source_account_id := input.body.sourceAccountId
    data.accounts[source_account_id].owner_id == user_id
}

# Rule: Customers can list their own payments.
# The service itself is responsible for filtering the results to this user's payments.
# API: GET /v1/payments
allow_payments_service {
    path[0] == "v1"; path[1] == "payments"
    count(path) == 2
    method == "GET"
    "customer" in roles
}

# Rule: A user (customer or support) can view a specific payment's details.
# API: GET /v1/payments/{paymentId}
allow_payments_service {
    path[0] == "v1"; path[1] == "payments"
    count(path) == 3
    method == "GET"
    payment_id := path[2]

    is_authorized_for_payment(payment_id)
}

# Helper: A user is authorized if they are a support agent.
is_authorized_for_payment(_) {
    "support" in roles
}

# Helper: A user is authorized if they are a customer who sent the payment.
# This requires a data-driven policy with `data.payments` mapping payment IDs to participants.
# Example: data.payments = {"payment-abc": {"sender_id": "user-456", "receiver_id": "user-789"}}
is_authorized_for_payment(payment_id) {
    "customer" in roles
    payment_details := data.payments[payment_id]
    payment_details.sender_id == user_id
}

# Helper: A user is authorized if they are a customer who received the payment.
is_authorized_for_payment(payment_id) {
    "customer" in roles
    payment_details := data.payments[payment_id]
    payment_details.receiver_id == user_id
}
