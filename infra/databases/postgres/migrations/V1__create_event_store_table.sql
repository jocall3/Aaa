-- V1__create_event_store_table.sql

-- This migration script creates the foundational 'event_store' table.
-- This table is the backbone of our Event Sourcing and CQRS architecture.
-- It will serve as the single source of truth for the state changes of our aggregates.

CREATE TABLE IF NOT EXISTS event_store (
    -- A global, monotonically increasing sequence number for all events.
    -- This serves as the primary key and provides a total ordering of events across all aggregates.
    id BIGSERIAL PRIMARY KEY,

    -- The unique identifier for an aggregate instance (e.g., a specific account's UUID).
    -- All events for a single aggregate instance will share the same aggregate_id.
    aggregate_id UUID NOT NULL,

    -- The type of the aggregate (e.g., 'Account', 'Customer'). This helps in dispatching events
    -- to the correct aggregate type for state reconstruction.
    aggregate_type VARCHAR(255) NOT NULL,

    -- The version number of the aggregate after this event is applied.
    -- This is used for optimistic concurrency control to prevent conflicting updates.
    -- The first event for an aggregate will have version 1.
    version BIGINT NOT NULL,

    -- A string identifier for the type of event (e.g., 'AccountCreated', 'FundsDeposited').
    event_type VARCHAR(255) NOT NULL,

    -- The payload of the event, containing all the data associated with the state change.
    -- Stored in JSONB format for efficient querying and indexing.
    payload JSONB NOT NULL,

    -- Metadata associated with the event, such as correlation_id, causation_id, user_id, etc.
    -- Stored in JSONB format.
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- The timestamp when the event was recorded in the store.
    created_at TIMESTAMPTZ NOT NULL DEFAULT (now()),

    -- Enforces that each aggregate can only have one event at a specific version,
    -- which is fundamental for optimistic concurrency checks.
    CONSTRAINT unique_aggregate_version UNIQUE (aggregate_id, version),

    -- Ensure the version is always a positive number.
    CONSTRAINT positive_version CHECK (version > 0)
);

-- Index to efficiently retrieve all events for a given aggregate, ordered by version.
-- The unique constraint on (aggregate_id, version) already creates a suitable index for this purpose.

-- Index to efficiently query events by their type.
-- This is useful for building specific projections or for analytics.
CREATE INDEX IF NOT EXISTS idx_event_store_event_type ON event_store (event_type);

-- Index to efficiently query events by aggregate type.
-- This can be useful when building projections for all aggregates of a certain type.
CREATE INDEX IF NOT EXISTS idx_event_store_aggregate_type ON event_store (aggregate_type);

-- Index on the creation timestamp to allow for efficient time-based queries,
-- such as replaying events since a certain point in time for read model projections.
CREATE INDEX IF NOT EXISTS idx_event_store_created_at ON event_store (created_at);

-- Add comments to the table and columns for documentation purposes, adhering to the 'Docs-as-Code' directive.
COMMENT ON TABLE event_store IS 'Stores the sequence of state-changing events for all aggregates in the system, serving as the single source of truth (write model) in an Event Sourcing pattern.';
COMMENT ON COLUMN event_store.id IS 'Global, monotonically increasing sequence number for all events (Primary Key).';
COMMENT ON COLUMN event_store.aggregate_id IS 'The UUID of the aggregate instance to which the event belongs.';
COMMENT ON COLUMN event_store.aggregate_type IS 'The business domain type of the aggregate (e.g., Account, User, Payment).';
COMMENT ON COLUMN event_store.version IS 'The sequence number of the event for a specific aggregate instance, used for optimistic concurrency control.';
COMMENT ON COLUMN event_store.event_type IS 'The specific type of the event that occurred (e.g., AccountCreated, FundsDeposited).';
COMMENT ON COLUMN event_store.payload IS 'The JSONB payload containing the data for the event.';
COMMENT ON COLUMN event_store.metadata IS 'The JSONB payload containing metadata about the event (e.g., correlation_id, causation_id, user_id).';
COMMENT ON COLUMN event_store.created_at IS 'The timestamp (with time zone) when the event was persisted.';