terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    # Configured per-environment via -backend-config
    # bucket = "revbrain-{env}-tfstate"
    # prefix = "infra"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ---------- Variables ----------

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (stg or prod)"
  type        = string
  validation {
    condition     = contains(["stg", "prod"], var.environment)
    error_message = "Environment must be 'stg' or 'prod'."
  }
}

variable "github_repo" {
  description = "GitHub repository (org/repo format)"
  type        = string
  default     = "danielbenzimri/revbrain"
}

# ---------- APIs ----------

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# ---------- Artifact Registry ----------

resource "google_artifact_registry_repository" "worker" {
  location      = var.region
  repository_id = "revbrain"
  format        = "DOCKER"
  description   = "RevBrain container images"

  depends_on = [google_project_service.apis]
}

# ---------- Service Accounts ----------

# Worker SA — used by Cloud Run Job at runtime
resource "google_service_account" "worker" {
  account_id   = "cpq-worker"
  display_name = "CPQ Extraction Worker"

  depends_on = [google_project_service.apis]
}

# Deploy SA — used by GitHub Actions CI/CD
resource "google_service_account" "deploy" {
  account_id   = "github-deploy"
  display_name = "GitHub Actions Deploy"

  depends_on = [google_project_service.apis]
}

# ---------- IAM: Worker permissions ----------

# Worker can read secrets
resource "google_project_iam_member" "worker_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

# ---------- IAM: Deploy permissions ----------

# Deploy can push images
resource "google_project_iam_member" "deploy_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# Deploy can update Cloud Run Jobs
resource "google_project_iam_member" "deploy_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# Deploy needs to act as the worker SA when updating the job
resource "google_service_account_iam_member" "deploy_acts_as_worker" {
  service_account_id = google_service_account.worker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

# ---------- Workload Identity Federation (GitHub Actions) ----------

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == '${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow GitHub Actions from our repo to impersonate the deploy SA
resource "google_service_account_iam_member" "github_impersonates_deploy" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# ---------- Secret Manager ----------

locals {
  secrets = [
    "DATABASE_URL",
    "SALESFORCE_TOKEN_ENCRYPTION_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_URL",
    "INTERNAL_API_URL",
    "INTERNAL_API_SECRET",
  ]
}

resource "google_secret_manager_secret" "worker_secrets" {
  for_each  = toset(local.secrets)
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# ---------- Cloud Run Job ----------

resource "google_cloud_run_v2_job" "worker" {
  name     = "cpq-worker-${var.environment}"
  location = var.region

  template {
    task_count = 1

    template {
      max_retries = 1
      timeout     = "3600s" # 1 hour

      service_account = google_service_account.worker.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/revbrain/worker:latest"

        resources {
          limits = {
            cpu    = "2"
            memory = "2Gi"
          }
        }

        # Secrets injected as env vars
        dynamic "env" {
          for_each = google_secret_manager_secret.worker_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value.secret_id
                version = "latest"
              }
            }
          }
        }

        # Static env vars
        env {
          name  = "NODE_ENV"
          value = var.environment == "prod" ? "production" : "staging"
        }

        env {
          name  = "LOG_LEVEL"
          value = var.environment == "prod" ? "info" : "debug"
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.worker,
  ]

  lifecycle {
    # Image is updated by CI/CD, not Terraform
    ignore_changes = [
      template[0].template[0].containers[0].image,
    ]
  }
}

# ---------- Terraform State Bucket ----------

resource "google_storage_bucket" "tfstate" {
  name     = "${var.project_id}-tfstate"
  location = var.region

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      num_newer_versions = 5
    }
    action {
      type = "Delete"
    }
  }
}

# ---------- Outputs ----------

output "artifact_registry_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/revbrain"
}

output "worker_service_account" {
  value = google_service_account.worker.email
}

output "deploy_service_account" {
  value = google_service_account.deploy.email
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "cloud_run_job_name" {
  value = google_cloud_run_v2_job.worker.name
}
