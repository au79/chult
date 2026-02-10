#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"
HOSTED_ZONE_ID=${HOSTED_ZONE_ID:-}
TIMESTAMP_TAG=${TIMESTAMP_TAG:-$(date -u +"%Y%m%d%H%M%S")}

if [[ -z "$HOSTED_ZONE_ID" ]]; then
  echo "ERROR: HOSTED_ZONE_ID is required."
  exit 1
fi

IMAGE_TAG=${IMAGE_TAG:-$TIMESTAMP_TAG}

export IMAGE_TAG REPO_NAME AWS_REGION
"$INFRA_DIR/scripts/push-ecr-image.sh"

pnpm --dir "$INFRA_DIR" cdk deploy ChultServiceStack \
  --parameters HostedZoneId="$HOSTED_ZONE_ID" \
  --parameters ImageTag="$IMAGE_TAG"
