#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"

DELETE_DB_TABLE=0
for arg in "$@"; do
  case "$arg" in
    --delete-db-table)
      DELETE_DB_TABLE=1
      ;;
    *)
      echo "ERROR: Unknown argument: $arg"
      echo "Usage: $0 [--delete-db-table]"
      exit 1
      ;;
  esac
done

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required but was not found in PATH."
  exit 1
fi

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

echo "Infra down complete. Service bucket preserved: $SERVICE_BUCKET_NAME"
