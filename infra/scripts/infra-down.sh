#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required but was not found in PATH."
  exit 1
fi

# Destroy main stack (bucket is imported, so it will be preserved).
pnpm --dir "$INFRA_DIR" cdk destroy ChultServiceStack --force

# Destroy CloudFront cert stack in us-east-1.
pnpm --dir "$INFRA_DIR" cdk destroy ChultCloudFrontCertStack --force

echo "Infra down complete. Service bucket preserved: $SERVICE_BUCKET_NAME"
