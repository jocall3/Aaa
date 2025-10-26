terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "The AWS region to deploy resources into."
  type        = string
}

variable "project_name" {
  description = "The name of the project."
  type        = string
}

variable "environment" {
  description = "The deployment environment (e.g., 'dev', 'staging', 'prod')."
  type        = string
}

variable "vpc_id" {
  description = "The ID of the VPC where the Redis cluster will be deployed."
  type        = string
}

variable "private_subnet_ids" {
  description = "A list of private subnet IDs for the Redis cluster nodes."
  type        = list(string)
}

variable "vpc_cidr_block" {
  description = "The CIDR block of the VPC, used for the security group rules."
  type        = string
}

variable "redis_node_type" {
  description = "The instance type for the Redis cache nodes (e.g., cache.t3.medium)."
  type        = string
  default     = "cache.t3.medium"
}

variable "redis_num_nodes" {
  description = "The number of nodes in the Redis cluster (e.g., 2 for a primary and a replica)."
  type        = number
  default     = 2
}

variable "redis_version" {
  description = "The version of the Redis engine to use."
  type        = string
  default     = "7.0"
}

locals {
  cluster_name = "${var.project_name}-redis-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Layer       = "Infrastructure"
    Component   = "Redis"
  }
}

# ------------------------------------------------------------------------------
# NETWORKING & SECURITY
# ------------------------------------------------------------------------------

resource "aws_security_group" "redis_sg" {
  name        = "${local.cluster_name}-sg"
  description = "Allow inbound Redis traffic from within the VPC."
  vpc_id      = var.vpc_id

  ingress {
    description = "Redis"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name       = "${local.cluster_name}-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = local.tags
}

# ------------------------------------------------------------------------------
# LOGGING
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "redis_log_group" {
  name              = "/aws/elasticache/${local.cluster_name}"
  retention_in_days = 14
  tags              = local.tags
}

# ------------------------------------------------------------------------------
# ELASTICACHE FOR REDIS CLUSTER
# ------------------------------------------------------------------------------

# This ElastiCache Replication Group provides a highly available Redis cluster.
# It serves as the distributed cache for BFF and microservice layers, as per
# the multi-layer caching strategy. Encryption in transit and at rest are enabled.
resource "aws_elasticache_replication_group" "redis_cluster" {
  replication_group_id       = local.cluster_name
  description                = "Redis cluster for ${var.project_name} in ${var.environment}"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.redis_num_nodes
  engine                     = "redis"
  engine_version             = var.redis_version
  port                       = 6379
  parameter_group_name       = "default.redis${var.redis_version}"
  automatic_failover_enabled = true
  multi_az_enabled           = var.redis_num_nodes > 1 ? true : false

  # Security
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  auth_token_update_strategy = "ROTATE_ON_CREATE" # AWS will generate and manage the auth token in Secrets Manager.

  # Networking
  subnet_group_name  = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids = [aws_security_group.redis_sg.id]

  # Maintenance & Logging
  auto_minor_version_upgrade = true
  maintenance_window         = "sun:05:00-sun:06:00"

  log_delivery_configuration {
    destination_type = "cloudwatch-logs"
    destination      = aws_cloudwatch_log_group.redis_log_group.name
    log_format       = "json"
    log_type         = "slow-log"
  }
  log_delivery_configuration {
    destination_type = "cloudwatch-logs"
    destination      = aws_cloudwatch_log_group.redis_log_group.name
    log_format       = "json"
    log_type         = "engine-log"
  }

  tags = local.tags

  # This dependency ensures that the log group is created before the cluster tries to use it.
  depends_on = [
    aws_cloudwatch_log_group.redis_log_group
  ]
}

# ------------------------------------------------------------------------------
# OUTPUTS
# ------------------------------------------------------------------------------

output "redis_replication_group_id" {
  description = "The ID of the ElastiCache Redis replication group."
  value       = aws_elasticache_replication_group.redis_cluster.id
}

output "redis_primary_endpoint_address" {
  description = "The address of the primary endpoint for the Redis cluster."
  value       = aws_elasticache_replication_group.redis_cluster.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "The port number for the Redis cluster."
  value       = aws_elasticache_replication_group.redis_cluster.port
}

output "redis_auth_token_secret_arn" {
  description = "The ARN of the secret in AWS Secrets Manager that stores the Redis auth token."
  value       = aws_elasticache_replication_group.redis_cluster.auth_token
  sensitive   = true
}
