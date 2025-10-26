package policy.accounts

#
# Default Authorization Policy
#
# By default, all requests are denied. Specific 'allow' rules must be defined
# to grant access. This aligns with the principle of least privilege and follows a
# default-deny security posture as mandated by the architectural directives.
#
default allow = false

#
# Input Data Aliases
#
# These assignments provide convenient aliases for accessing parts of the OPA input document.
# This policy assumes an input structure common for API gateway integrations (e.g., Envoy).
#
# user: The identity of the caller, typically from a validated JWT.
# http: Details of the incoming HTTP request.
# path: The request path, split into an array for easier matching.
# body: The parsed JSON body of the request, if present.
#
user := input.principal
http := input.attributes.request.http
path := split(trim(http.path, "/"), "/")
body := input.body

#
# Data Document Aliases
#
# This policy relies on external data being provided to OPA. The 'data' document
# contains information about the resources being accessed, such as account ownership.
# This decouples the policy from having to query databases directly.
#
# Example data structure provided to OPA:
# data.accounts: {
#   "{accountId}": {
#     "owners": ["{userId1}", "{userId2}"]
#   }
# }
#
# Extract the account ID from paths like /api/accounts/v1/accounts/{accountId}
account_id := path[4]
account := data.accounts[account_id]

#
# --- Helper Rules ---
#

# user_has_role checks if the authenticated user has a specific role.
user_has_role(role) {
    user.roles[_] == role
}

# is_account_owner checks if the user is listed as an owner of the account
# being accessed in the current request.
is_account_owner {
    # Check if the path is long enough to have an account ID
    count(path) > 4
    # Check if the account data exists for the given ID
    account
    # Check for ownership
    account.owners[_] == user.id
}


#
# --- Main Authorization Rules ---
#

#
# Rule: Grant Full Access to Administrators
#
# Users with the 'admin' role are granted blanket access to all operations.
# This is a high-privilege rule and should be used with caution.
#
allow {
    user_has_role("admin")
}

#
# Rule: Allow Authenticated Users to List Their Own Accounts
#
# Corresponds to: GET /api/accounts/v1/accounts
# An authenticated user can retrieve a list of their accounts.
# Note: The 'accounts-service' is responsible for filtering the list to only
# the user's accounts. This policy just grants access to the endpoint.
#
allow {
    http.method == "GET"
    path == ["api", "accounts", "v1", "accounts"]
    user_has_role("user")
}

#
# Rule: Allow Account Owners to View Account Details
#
# Corresponds to: GET /api/accounts/v1/accounts/{accountId}
# Access is granted if the user's ID is in the 'owners' list of the requested account.
#
allow {
    http.method == "GET"
    path[0] == "api"
    path[1] == "accounts"
    path[2] == "v1"
    path[3] == "accounts"
    count(path) == 5
    is_account_owner
}

#
# Rule: Allow Users to Create an Account for Themselves
#
# Corresponds to: POST /api/accounts/v1/accounts
# Access is granted if the 'userId' in the request body matches the ID of the
# authenticated user making the request. This prevents a user from creating
# an account for someone else.
#
allow {
    http.method == "POST"
    path == ["api", "accounts", "v1", "accounts"]
    user_has_role("user")
    body.userId == user.id
}

#
# Rule: Allow Account Owners to Perform Transactions and Updates
#
# Corresponds to:
# - POST /api/accounts/v1/accounts/{accountId}/deposits
# - POST /api/accounts/v1/accounts/{accountId}/withdrawals
# - PATCH /api/accounts/v1/accounts/{accountId}
#
# Access is granted for these state-changing operations only if the user is an owner.
#
allow {
    path[0] == "api"
    path[1] == "accounts"
    path[2] == "v1"
    path[3] == "accounts"
    is_account_owner

    # Matches PATCH /api/accounts/v1/accounts/{accountId}
    (http.method == "PATCH" and count(path) == 5)
    
    # Matches POST /api/accounts/v1/accounts/{accountId}/[deposits|withdrawals]
    or (
        http.method == "POST"
        and count(path) == 6
        and path[5] in {"deposits", "withdrawals"}
    )
}

#
# Rule: Allow Account Owners to Close an Account
#
# Corresponds to: DELETE /api/accounts/v1/accounts/{accountId}
# Access is granted only if the user is an owner of the account.
#
allow {
    http.method == "DELETE"
    path[0] == "api"
    path[1] == "accounts"
    path[2] == "v1"
    path[3] == "accounts"
    count(path) == 5
    is_account_owner
}
