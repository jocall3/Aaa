terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "The name for the Vault cluster."
  type        = string
  default     = "vault-main-cluster"
}

variable "vpc_id" {
  description = "The ID of the VPC to deploy Vault into."
  type        = string
}

variable "subnet_ids" {
  description = "A list of private subnet IDs for the Vault cluster nodes and load balancer."
  type        = list(string)
}

variable "allowed_inbound_cidr_blocks" {
  description = "CIDR blocks allowed to access the Vault UI/API."
  type        = list(string)
  default     = ["0.0.0.0/0"] # In production, this should be restricted to specific IPs
}

variable "instance_type" {
  description = "EC2 instance type for Vault nodes."
  type        = string
  default     = "t3.medium"
}

variable "cluster_size" {
  description = "Number of nodes in the Vault cluster (3 or 5 recommended)."
  type        = number
  default     = 3
}

variable "vault_version" {
  description = "The version of HashiCorp Vault to install."
  type        = string
  default     = "1.15.2"
}

locals {
  tags = {
    Project       = "BankingPlatform"
    Service       = "Vault"
    ManagedBy     = "Terraform"
    VaultCluster  = var.cluster_name
    VaultAutoJoin = var.cluster_name
  }
}

data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_caller_identity" "current" {}

# --- Security Groups ---

resource "aws_security_group" "vault_lb" {
  name        = "${var.cluster_name}-lb-sg"
  description = "Allow traffic to the Vault Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 8200
    to_port     = 8200
    protocol    = "tcp"
    cidr_blocks = var.allowed_inbound_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "vault_node" {
  name        = "${var.cluster_name}-node-sg"
  description = "Allow traffic to Vault cluster nodes"
  vpc_id      = var.vpc_id

  # API traffic from the load balancer
  ingress {
    from_port       = 8200
    to_port         = 8200
    protocol        = "tcp"
    security_groups = [aws_security_group.vault_lb.id]
  }

  # Cluster traffic between nodes
  ingress {
    from_port = 8201
    to_port   = 8201
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

# --- Auto-Unseal with AWS KMS ---

resource "aws_kms_key" "vault_unseal" {
  description             = "Vault auto-unseal key for ${var.cluster_name}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = local.tags
}

resource "aws_kms_alias" "vault_unseal" {
  name          = "alias/${var.cluster_name}-unseal"
  target_key_id = aws_kms_key.vault_unseal.key_id
}

# --- IAM Role for Vault EC2 Instances ---

resource "aws_iam_role" "vault_server" {
  name = "${var.cluster_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_policy" "vault_server_policy" {
  name        = "${var.cluster_name}-policy"
  description = "Policy for Vault servers to allow auto-unseal and auto-join."

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:DescribeKey"],
        Resource = aws_kms_key.vault_unseal.arn
      },
      {
        Effect = "Allow",
        Action = "ec2:DescribeInstances",
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "vault_server_attachment" {
  role       = aws_iam_role.vault_server.name
  policy_arn = aws_iam_policy.vault_server_policy.arn
}

resource "aws_iam_instance_profile" "vault_server" {
  name = "${var.cluster_name}-instance-profile"
  role = aws_iam_role.vault_server.name
}

# --- Network Load Balancer ---

resource "aws_lb" "vault" {
  name               = substr(var.cluster_name, 0, 32)
  internal           = false
  load_balancer_type = "network"
  subnets            = var.subnet_ids

  tags = local.tags
}

resource "aws_lb_target_group" "vault_api" {
  name        = substr("${var.cluster_name}-api", 0, 32)
  port        = 8200
  protocol    = "TCP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    protocol = "TCP"
    port     = "8200"
  }

  tags = local.tags
}

resource "aws_lb_listener" "vault_api" {
  load_balancer_arn = aws_lb.vault.arn
  port              = 8200
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.vault_api.arn
  }
}

# --- EC2 Launch Template & Auto Scaling Group ---

resource "aws_launch_template" "vault" {
  name_prefix   = "${var.cluster_name}-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.vault_server.name
  }

  network_interfaces {
    associate_public_ip_address = false # For private subnets
    security_groups             = [aws_security_group.vault_node.id]
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 20
      volume_type = "gp3"
      delete_on_termination = true
    }
  }
  
  tag_specifications {
    resource_type = "instance"
    tags          = local.tags
  }

  user_data = base64encode(<<-EOT
    #!/bin/bash
    set -e
    
    # Variables
    VAULT_VERSION="${var.vault_version}"
    
    # Install dependencies
    yum update -y
    yum install -y unzip jq
    
    # Download and install Vault
    curl -o vault.zip https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_linux_amd64.zip
    unzip vault.zip
    mv vault /usr/local/bin/
    chmod +x /usr/local/bin/vault
    
    # Create Vault user and directories
    useradd --system --home /etc/vault.d --shell /bin/false vault
    mkdir -p /opt/vault/data
    chown -R vault:vault /opt/vault/data
    mkdir -p /etc/vault.d
    chown -R vault:vault /etc/vault.d
    
    # Get instance metadata
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)

    # Create Vault config file
    cat <<EOF > /etc/vault.d/vault.hcl
    ui = true
    disable_mlock = true
    
    storage "raft" {
      path    = "/opt/vault/data"
      node_id = "${INSTANCE_ID}"
      retry_join {
        auto_join = "provider=aws region=${var.aws_region} tag_key=VaultAutoJoin tag_value=${var.cluster_name}"
      }
    }
    
    seal "awskms" {
      region     = "${var.aws_region}"
      kms_key_id = "${aws_kms_key.vault_unseal.id}"
    }
    
    listener "tcp" {
      address       = "0.0.0.0:8200"
      cluster_address = "${PRIVATE_IP}:8201"
      tls_disable   = true # TLS handled by Service Mesh as per architecture
    }
    
    api_addr = "http://${PRIVATE_IP}:8200"
    cluster_addr = "http://${PRIVATE_IP}:8201"
    EOF
    
    chown vault:vault /etc/vault.d/vault.hcl
    
    # Create systemd service file
    cat <<EOF > /etc/systemd/system/vault.service
    [Unit]
    Description="HashiCorp Vault - A tool for managing secrets"
    Documentation=https://www.vaultproject.io/docs/
    Requires=network-online.target
    After=network-online.target
    ConditionFileNotEmpty=/etc/vault.d/vault.hcl
    
    [Service]
    User=vault
    Group=vault
    ProtectSystem=full
    ProtectHome=read-only
    PrivateTmp=yes
    PrivateDevices=yes
    SecureBits=keep-caps
    AmbientCapabilities=CAP_IPC_LOCK
    CapabilityBoundingSet=CAP_SYSLOG CAP_IPC_LOCK
    NoNewPrivileges=yes
    ExecStart=/usr/local/bin/vault server -config=/etc/vault.d/vault.hcl
    ExecReload=/bin/kill --signal HUP $MAINPID
    KillMode=process
    KillSignal=SIGINT
    Restart=on-failure
    RestartSec=5
    TimeoutStopSec=30
    StartLimitInterval=60
    StartLimitBurst=3
    LimitNOFILE=65536
    
    [Install]
    WantedBy=multi-user.target
    EOF
    
    # Start Vault service
    systemctl enable vault
    systemctl start vault
    EOT
  )

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_autoscaling_group" "vault" {
  name                      = "${var.cluster_name}-asg"
  desired_capacity          = var.cluster_size
  max_size                  = var.cluster_size
  min_size                  = var.cluster_size
  vpc_zone_identifier       = var.subnet_ids
  target_group_arns         = [aws_lb_target_group.vault_api.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.vault.id
    version = "$Latest"
  }

  # Ensure instances are replaced one by one if the launch template changes
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 66 # For a 3-node cluster, allows 1 to be down
    }
  }

  tags = [
    for k, v in local.tags : {
      key                 = k
      value               = v
      propagate_at_launch = true
    }
  ]
}
