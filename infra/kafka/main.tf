# ------------------------------------------------------------------------------
# Terraform configuration for the Event Backbone (AWS MSK & Glue Schema Registry)
#
# This file defines the core infrastructure for the event-driven architecture,
# as mandated by the architectural directives. It provisions:
# 1. A secure, highly-available AWS MSK (Managed Streaming for Kafka) cluster.
# 2. An AWS Glue Schema Registry to enforce a schema-first approach for all events.
# 3. Kafka topics for each domain, supporting CQRS and Event Sourcing patterns.
#
# This setup aligns with the "Abstracted Event Bus with a Centralized Schema
# Registry" and "Implement a Saga Orchestration Pattern" directives.
# ------------------------------------------------------------------------------

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0"
    }
    kafka = {
      source  = "hashicorp/kafka"
      version = ">= 0.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ------------------------------------------------------------------------------
# INPUT VARIABLES
# ------------------------------------------------------------------------------

variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
}

variable "project_name" {
  description = "The name of the project, used for naming resources."
  type        = string
  default     = "elite-bank"
}

variable "environment" {
  description = "The deployment environment (e.g., 'dev', 'staging', 'prod')."
  type        = string
}

variable "vpc_id" {
  description = "The ID of the VPC to deploy the MSK cluster into."
  type        = string
}

variable "vpc_cidr_block" {
  description = "The CIDR block of the VPC."
  type        = string
}

variable "subnet_ids" {
  description = "A list of private subnet IDs for the MSK cluster nodes."
  type        = list(string)
}

variable "kafka_version" {
  description = "The desired Kafka software version for the MSK cluster."
  type        = string
  default     = "2.8.1"
}

variable "number_of_broker_nodes" {
  description = "The number of broker nodes in the Kafka cluster. Must be a multiple of the number of AZs."
  type        = number
  default     = 3
}

variable "broker_instance_type" {
  description = "The EC2 instance type for the Kafka brokers."
  type        = string
  default     = "kafka.m5.large"
}


# ------------------------------------------------------------------------------
# LOCAL VARIABLES & CONFIGURATION
# ------------------------------------------------------------------------------

locals {
  cluster_name = "${var.project_name}-msk-cluster-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Layer       = "Infrastructure"
    Component   = "Kafka"
  }

  # Avro schema definitions for key domain events, enforcing a strict schema-first approach.
  account_created_event_schema = jsonencode({
    type      = "record",
    name      = "AccountCreatedEvent",
    namespace = "com.elitebank.accounts.events",
    fields = [
      { name = "accountId", type = "string" },
      { name = "userId", type = "string" },
      { name = "accountType", type = "string" },
      { name = "currency", type = "string" },
      { name = "initialBalance", type = "double" },
      { name = "createdAt", type = { "type" = "long", "logicalType" = "timestamp-millis" } }
    ]
  })

  payment_initiated_event_schema = jsonencode({
    type      = "record",
    name      = "PaymentInitiatedEvent",
    namespace = "com.elitebank.payments.events",
    fields = [
      { name = "paymentId", type = "string" },
      { name = "sourceAccountId", type = "string" },
      { name = "destinationAccountId", type = "string" },
      { name = "amount", type = "double" },
      { name = "currency", type = "string" },
      { name = "initiatedAt", type = { "type" = "long", "logicalType" = "timestamp-millis" } }
    ]
  })
}

# ------------------------------------------------------------------------------
# NETWORKING & SECURITY
# ------------------------------------------------------------------------------

# Security Group for MSK Cluster
# Allows traffic from within the VPC on Kafka's mTLS and Zookeeper ports.
resource "aws_security_group" "msk_sg" {
  name        = "${local.cluster_name}-sg"
  description = "Security group for MSK cluster, enabling mTLS communication."
  vpc_id      = var.vpc_id

  ingress {
    description = "Kafka mTLS port"
    from_port   = 9094
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
    self        = true
  }

  ingress {
    description = "Zookeeper port"
    from_port   = 2181
    to_port     = 2181
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

# ------------------------------------------------------------------------------
# ENCRYPTION & CERTIFICATION AUTHORITY
# ------------------------------------------------------------------------------

# KMS Key for Encryption at Rest
resource "aws_kms_key" "msk_key" {
  description             = "KMS key for MSK cluster ${local.cluster_name}"
  deletion_window_in_days = 10
  tags                    = local.tags
}

# AWS Certificate Manager Private Certificate Authority for mTLS
resource "aws_acmpca_certificate_authority" "kafka_ca" {
  certificate_authority_configuration {
    key_algorithm     = "RSA_4096"
    signing_algorithm = "SHA512WITHRSA"

    subject {
      common_name  = "${var.project_name}.kafka.ca.${var.environment}"
      organization = "${var.project_name} Inc."
      country      = "US"
    }
  }

  revocation_configuration {
    crl_configuration {
      enabled            = true
      expiration_in_days = 7
    }
  }

  permanent_deletion_time_in_days = 7 # Set for dev, increase for prod
  tags                            = local.tags
}

# Self-sign the CA certificate
resource "aws_acmpca_certificate" "kafka_ca_cert" {
  certificate_authority_arn   = aws_acmpca_certificate_authority.kafka_ca.arn
  certificate_signing_request = aws_acmpca_certificate_authority.kafka_ca.certificate_signing_request
  signing_algorithm           = "SHA512WITHRSA"
  template_arn                = "arn:aws:acm-pca:::template/RootCACertificate/V1"
  validity {
    type  = "YEARS"
    value = 10
  }
}

# Import the signed certificate into the CA to activate it
resource "aws_acmpca_certificate_authority_certificate" "kafka_ca_import" {
  certificate_authority_arn = aws_acmpca_certificate_authority.kafka_ca.arn
  certificate               = aws_acmpca_certificate.kafka_ca_cert.certificate
  certificate_chain         = aws_acmpca_certificate.kafka_ca_cert.certificate_chain
}

# ------------------------------------------------------------------------------
# KAFKA CLUSTER (AWS MSK)
# ------------------------------------------------------------------------------

resource "aws_msk_cluster" "kafka_cluster" {
  depends_on = [aws_acmpca_certificate_authority_certificate.kafka_ca_import]

  cluster_name           = local.cluster_name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.number_of_broker_nodes
  enhanced_monitoring    = "PER_TOPIC_PER_BROKER"

  broker_node_group_info {
    instance_type   = var.broker_instance_type
    ebs_volume_size = 1000
    client_subnets  = var.subnet_ids
    security_groups = [aws_security_group.msk_sg.id]
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk_key.arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  client_authentication {
    tls {
      certificate_authority_arns = [aws_acmpca_certificate_authority.kafka_ca.arn]
    }
  }

  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
      }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = "/aws/msk/${local.cluster_name}"
      }
    }
  }

  tags = local.tags
}

# ------------------------------------------------------------------------------
# SCHEMA REGISTRY (AWS GLUE)
# ------------------------------------------------------------------------------

resource "aws_glue_registry" "domain_events" {
  registry_name = "${var.project_name}-domain-events-${var.environment}"
  description   = "Centralized schema registry for all domain events."
  tags          = local.tags
}

# This schema subject follows the TopicRecordNameStrategy, where the subject name
# is constructed as: <topic-name>-<fully-qualified-record-name>.
resource "aws_glue_schema" "account_created_event" {
  schema_name       = "${var.environment}.accounts.events-com.elitebank.accounts.events.AccountCreatedEvent"
  registry_arn      = aws_glue_registry.domain_events.arn
  data_format       = "AVRO"
  compatibility     = "BACKWARD" # Allows for backward-compatible schema evolution.
  schema_definition = local.account_created_event_schema
  tags              = local.tags
}

resource "aws_glue_schema" "payment_initiated_event" {
  schema_name       = "${var.environment}.payments.events-com.elitebank.payments.events.PaymentInitiatedEvent"
  registry_arn      = aws_glue_registry.domain_events.arn
  data_format       = "AVRO"
  compatibility     = "BACKWARD"
  schema_definition = local.payment_initiated_event_schema
  tags              = local.tags
}

# ------------------------------------------------------------------------------
# KAFKA TOPICS
# ------------------------------------------------------------------------------

provider "kafka" {
  bootstrap_servers = aws_msk_cluster.kafka_cluster.bootstrap_brokers_tls
  # NOTE: To run this Terraform, the machine must have network access to the MSK brokers.
  # For mTLS, client certificates issued by the private CA must be configured here.
  # tls_enabled = true
  # ca_cert     = file("ca.pem")
  # client_cert = file("client.pem")
  # client_key  = file("client.key")
}

locals {
  domains = ["accounts", "payments", "identity", "rewards", "saga-orchestrator"]

  # Event topics for Event Sourcing and inter-service communication
  event_topics = toset([for domain in local.domains : "${domain}.events"])

  # Command topics for CQRS
  command_topics = toset([for domain in local.domains : "${domain}.commands"])

  # Combine all topics for resource creation
  all_topics = toset(concat(
    tolist(local.event_topics),
    tolist(local.command_topics)
  ))
}

# Define Kafka topics for each business domain.
resource "kafka_topic" "domain_topics" {
  for_each = local.all_topics

  name               = "${var.environment}.${each.key}"
  partitions         = 6
  replication_factor = var.number_of_broker_nodes >= 3 ? 3 : 1

  config = {
    "cleanup.policy" = "delete"    # Use 'compact' for event-sourced topics if needed.
    "retention.ms"   = "604800000" # 7 days
    "segment.bytes"  = "1073741824"  # 1 GB
  }
}

# ------------------------------------------------------------------------------
# OUTPUTS
# ------------------------------------------------------------------------------

output "msk_cluster_arn" {
  description = "The ARN of the MSK cluster."
  value       = aws_msk_cluster.kafka_cluster.arn
}

output "msk_cluster_name" {
  description = "The name of the MSK cluster."
  value       = aws_msk_cluster.kafka_cluster.cluster_name
}

output "bootstrap_brokers_tls" {
  description = "A comma separated list of the bootstraps brokers of the MSK cluster (TLS for mTLS)."
  value       = aws_msk_cluster.kafka_cluster.bootstrap_brokers_tls
  sensitive   = true
}

output "zookeeper_connect_string" {
  description = "A comma separated list of the Zookeeper connect strings."
  value       = aws_msk_cluster.kafka_cluster.zookeeper_connect_string
  sensitive   = true
}

output "private_ca_arn" {
  description = "The ARN of the private certificate authority for mTLS."
  value       = aws_acmpca_certificate_authority.kafka_ca.arn
}

output "glue_schema_registry_arn" {
  description = "The ARN of the Glue Schema Registry for domain events."
  value       = aws_glue_registry.domain_events.arn
}
