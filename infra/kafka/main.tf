terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    kafka = {
      source  = "hashicorp/kafka"
      version = "~> 0.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  cluster_name = "${var.project_name}-msk-cluster-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Layer       = "Infrastructure"
    Component   = "Kafka"
  }
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
    description      = "Kafka mTLS port"
    from_port        = 9094
    to_port          = 9094
    protocol         = "tcp"
    cidr_blocks      = [var.vpc_cidr_block]
    self             = true
  }

  ingress {
    description      = "Zookeeper port"
    from_port        = 2181
    to_port          = 2181
    protocol         = "tcp"
    cidr_blocks      = [var.vpc_cidr_block]
    self             = true
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
# As per security directives, all data must be encrypted at rest.
resource "aws_kms_key" "msk_key" {
  description             = "KMS key for MSK cluster ${local.cluster_name}"
  deletion_window_in_days = 10
  tags                    = local.tags
}

# AWS Certificate Manager Private Certificate Authority for mTLS
# Required by the Zero Trust security model to enforce mutual TLS between clients and brokers.
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

# AWS Managed Streaming for Kafka (MSK) Cluster
# This is the core of the event-driven backbone for the microservices architecture.
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
# KAFKA TOPICS
# ------------------------------------------------------------------------------

# The Kafka provider requires connectivity and credentials for the cluster.
# When using mTLS, client certificates must be provided. This often requires a two-step
# process: 1) Create cluster, 2) Generate client certs and configure provider to create topics.
# This configuration assumes credentials will be available when it runs.
provider "kafka" {
  bootstrap_servers = aws_msk_cluster.kafka_cluster.bootstrap_brokers_tls

  # NOTE: In a real-world scenario with mTLS, you would need to configure the provider
  # with client certificates issued by the Private CA created above.
  # tls_enabled = true
  # tls_config {
  #   ca_certs   = [file("ca.pem")]
  #   client_cert = file("client.pem")
  #   client_key  = file("client.key")
  # }
}

locals {
  domains = ["accounts", "payments", "identity", "rewards"]

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

# Define Kafka topics for each business domain, supporting Event Sourcing and CQRS patterns.
resource "kafka_topic" "domain_topics" {
  for_each = local.all_topics

  name               = "${var.environment}.${each.key}"
  partitions         = 6
  replication_factor = var.number_of_broker_nodes >= 3 ? 3 : 1

  config = {
    "cleanup.policy" = "delete"
    "retention.ms"   = "604800000" # 7 days
    "segment.bytes"  = "1073741824" # 1 GB
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
