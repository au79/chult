#!/usr/bin/env bash

# Load per-infra overrides from infra/.env when present.
# Set ENV_FILE to use a different file path.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ENV_FILE=${ENV_FILE:-"$INFRA_DIR/.env"}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

REPO_NAME=${REPO_NAME:-chult-map-service}
IMAGE_TAG=${IMAGE_TAG:-}
AWS_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}
ROLE_NAME=${ROLE_NAME:-ChultLambdaExecutionRole}
SERVICE_BUCKET_NAME=${SERVICE_BUCKET_NAME:-}
HEXES_TABLE_NAME=${HEXES_TABLE_NAME:-chult-map-hexes}

is_valid_s3_bucket_name() {
  local bucket="$1"

  if [[ -z "$bucket" ]]; then
    return 1
  fi
  if [[ ${#bucket} -lt 3 || ${#bucket} -gt 63 ]]; then
    return 1
  fi
  if [[ ! "$bucket" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]]; then
    return 1
  fi
  if [[ "$bucket" == *".."* ]]; then
    return 1
  fi
  if [[ "$bucket" == *".-"* || "$bucket" == *"-."* ]]; then
    return 1
  fi
  if [[ "$bucket" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    return 1
  fi

  return 0
}

resolve_effective_service_bucket_name() {
  if is_valid_s3_bucket_name "$SERVICE_BUCKET_NAME"; then
    SERVICE_BUCKET_NAME_SOURCE="configured"
    EFFECTIVE_SERVICE_BUCKET_NAME="$SERVICE_BUCKET_NAME"
    return 0
  fi

  SERVICE_BUCKET_NAME_SOURCE="default"
  ACCOUNT_ID_FOR_BUCKET=$(aws sts get-caller-identity --query Account --output text)
  EFFECTIVE_SERVICE_BUCKET_NAME="chult-map-service-${ACCOUNT_ID_FOR_BUCKET}-${AWS_REGION}"
}
