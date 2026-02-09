#!/usr/bin/env bash
set -euo pipefail

REPO_NAME=${REPO_NAME:-chult-map-service}
IMAGE_TAG=${IMAGE_TAG:-latest}
AWS_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required but was not found in PATH."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required but was not found in PATH."
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "ERROR: docker buildx is required but not available."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_HOST="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE_URI="$ECR_HOST/$REPO_NAME:$IMAGE_TAG"

aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$AWS_REGION" >/dev/null

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_HOST"

docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  -t "$IMAGE_URI" \
  --push \
  .

echo "Pushed $IMAGE_URI"
