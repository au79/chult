#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"

DELETE_DB_TABLE=0
DELETE_SERVICE_BUCKET=0
for arg in "$@"; do
  case "$arg" in
    --delete-db-table)
      DELETE_DB_TABLE=1
      ;;
    --delete-service-bucket)
      DELETE_SERVICE_BUCKET=1
      ;;
    *)
      echo "ERROR: Unknown argument: $arg"
      echo "Usage: $0 [--delete-db-table] [--delete-service-bucket]"
      exit 1
      ;;
  esac
done

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required but was not found in PATH."
  exit 1
fi

resolve_effective_service_bucket_name

# Destroy main stack (bucket is imported, so it will be preserved).
pnpm --dir "$INFRA_DIR" cdk destroy ChultServiceStack --force

# Destroy CloudFront cert stack in us-east-1.
pnpm --dir "$INFRA_DIR" cdk destroy ChultCloudFrontCertStack --force

if [[ $DELETE_DB_TABLE -eq 1 ]]; then
  echo "Exporting DynamoDB table before delete..."
  "$INFRA_DIR/scripts/dynamodb-export.sh"

  if aws dynamodb describe-table --table-name "$HEXES_TABLE_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "Deleting DynamoDB table $HEXES_TABLE_NAME..."
    aws dynamodb delete-table --table-name "$HEXES_TABLE_NAME" --region "$AWS_REGION" >/dev/null
    aws dynamodb wait table-not-exists --table-name "$HEXES_TABLE_NAME" --region "$AWS_REGION"
    echo "Deleted DynamoDB table $HEXES_TABLE_NAME."
  else
    echo "DynamoDB table $HEXES_TABLE_NAME does not exist. Skipping delete."
  fi
else
  echo "DynamoDB table preserved: $HEXES_TABLE_NAME"
fi

if [[ $DELETE_SERVICE_BUCKET -eq 1 ]]; then
  if aws s3api head-bucket --bucket "$EFFECTIVE_SERVICE_BUCKET_NAME" >/dev/null 2>&1; then
    TAG_VALUE=$(aws s3api get-bucket-tagging \
      --bucket "$EFFECTIVE_SERVICE_BUCKET_NAME" \
      --query 'TagSet[?Key==`ManagedBy`].Value | [0]' \
      --output text 2>/dev/null || true)

    if [[ "$TAG_VALUE" == "chult-infra-up" ]]; then
      echo "Deleting service bucket $EFFECTIVE_SERVICE_BUCKET_NAME..."
      aws s3 rm "s3://$EFFECTIVE_SERVICE_BUCKET_NAME" --recursive
      aws s3api delete-bucket --bucket "$EFFECTIVE_SERVICE_BUCKET_NAME" --region "$AWS_REGION"
      echo "Deleted service bucket $EFFECTIVE_SERVICE_BUCKET_NAME."
    else
      echo "Skipping delete for legacy/non-managed bucket $EFFECTIVE_SERVICE_BUCKET_NAME (missing ManagedBy=chult-infra-up tag)."
    fi
  else
    echo "Service bucket $EFFECTIVE_SERVICE_BUCKET_NAME does not exist. Skipping delete."
  fi
else
  echo "Service bucket preserved: $EFFECTIVE_SERVICE_BUCKET_NAME"
fi

echo "Infra down complete."
