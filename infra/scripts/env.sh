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
SERVICE_BUCKET_NAME=${SERVICE_BUCKET_NAME:-oolong-chult-map-service}
