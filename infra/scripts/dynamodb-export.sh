#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"

TABLE_NAME=${HEXES_TABLE_NAME}
OUTPUT_PATH=${1:-"$INFRA_DIR/tmp/${TABLE_NAME}-export-$(date -u +%Y%m%dT%H%M%SZ).json"}

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required but was not found in PATH."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but was not found in PATH."
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

TMP_ITEMS=$(mktemp)
echo '[]' > "$TMP_ITEMS"

EXCLUSIVE_START_KEY=""
while :; do
  if [[ -n "$EXCLUSIVE_START_KEY" ]]; then
    RESP=$(aws dynamodb scan \
      --table-name "$TABLE_NAME" \
      --region "$AWS_REGION" \
      --exclusive-start-key "$EXCLUSIVE_START_KEY" \
      --output json)
  else
    RESP=$(aws dynamodb scan \
      --table-name "$TABLE_NAME" \
      --region "$AWS_REGION" \
      --output json)
  fi

  PAGE_ITEMS=$(mktemp)
  echo "$RESP" | jq '.Items' > "$PAGE_ITEMS"
  jq -s '.[0] + .[1]' "$TMP_ITEMS" "$PAGE_ITEMS" > "$TMP_ITEMS.next"
  mv "$TMP_ITEMS.next" "$TMP_ITEMS"
  rm -f "$PAGE_ITEMS"

  EXCLUSIVE_START_KEY=$(echo "$RESP" | jq -c '.LastEvaluatedKey // empty')
  if [[ -z "$EXCLUSIVE_START_KEY" ]]; then
    break
  fi
done

jq -n \
  --arg tableName "$TABLE_NAME" \
  --arg region "$AWS_REGION" \
  --arg exportedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --slurpfile items "$TMP_ITEMS" \
  '{
    tableName: $tableName,
    region: $region,
    exportedAt: $exportedAt,
    itemCount: ($items[0] | length),
    items: $items[0]
  }' > "$OUTPUT_PATH"

rm -f "$TMP_ITEMS"
echo "Exported table $TABLE_NAME to $OUTPUT_PATH"
