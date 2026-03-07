#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"

INPUT_PATH=${1:-}
TABLE_NAME=${HEXES_TABLE_NAME}

if [[ -z "$INPUT_PATH" ]]; then
  echo "Usage: $0 <export-json-path>"
  exit 1
fi

if [[ ! -f "$INPUT_PATH" ]]; then
  echo "ERROR: Input file not found: $INPUT_PATH"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required but was not found in PATH."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but was not found in PATH."
  exit 1
fi

if ! jq -e 'if type=="array" then true else (.items | type=="array") end' "$INPUT_PATH" >/dev/null; then
  echo "ERROR: Input file must be an array of DynamoDB items or an object containing an items array."
  exit 1
fi

TOTAL_ITEMS=$(jq 'if type=="array" then length else .items | length end' "$INPUT_PATH")
if [[ "$TOTAL_ITEMS" -eq 0 ]]; then
  echo "No items to import."
  exit 0
fi

echo "Importing $TOTAL_ITEMS item(s) into $TABLE_NAME ($AWS_REGION)..."

for ((start = 0; start < TOTAL_ITEMS; start += 25)); do
  end=$((start + 25))

  REQUEST_FILE=$(mktemp)
  jq \
    --arg table "$TABLE_NAME" \
    --argjson start "$start" \
    --argjson end "$end" \
    '
      def arr: if type=="array" then . else .items end;
      {($table): (arr[$start:$end] | map({PutRequest:{Item:.}}))}
    ' "$INPUT_PATH" > "$REQUEST_FILE"

  ATTEMPT=0
  while :; do
    RESP=$(aws dynamodb batch-write-item \
      --request-items "file://$REQUEST_FILE" \
      --region "$AWS_REGION" \
      --output json)

    UNPROCESSED_COUNT=$(echo "$RESP" | jq --arg table "$TABLE_NAME" '(.UnprocessedItems[$table] // []) | length')
    if [[ "$UNPROCESSED_COUNT" -eq 0 ]]; then
      break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [[ "$ATTEMPT" -gt 10 ]]; then
      echo "ERROR: Unprocessed items remained after retries."
      rm -f "$REQUEST_FILE"
      exit 1
    fi

    echo "$RESP" | jq --arg table "$TABLE_NAME" '{($table): (.UnprocessedItems[$table] // [])}' > "$REQUEST_FILE"
    sleep 1
  done

  rm -f "$REQUEST_FILE"
done

echo "Import complete."
