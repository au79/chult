#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
TEST_BASH=$(command -v bash)

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "ASSERT FAILED: expected output to contain: $needle"
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "ASSERT FAILED: expected output not to contain: $needle"
    exit 1
  fi
}

setup_fake_binaries() {
  local dir="$1"
  local include_aws="${FAKE_INCLUDE_AWS:-1}"

  ln -s "$(command -v dirname)" "$dir/dirname"

  if [[ "$include_aws" == "1" ]]; then
    cat > "$dir/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "aws $*" >> "${AWS_LOG_FILE:?}"

if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then
  # Return a fake account ID for default bucket-name resolution.
  echo "${FAKE_ACCOUNT_ID:-123456789012}"
  exit 0
fi

# Simulate bucket existence checks with a configurable success/failure result.
if [[ "$1" == "s3api" && "$2" == "head-bucket" ]]; then
  if [[ "${FAKE_HEAD_BUCKET_EXISTS:-1}" == "1" ]]; then
    exit 0
  fi
  exit 1
fi

# Return a configurable ManagedBy tag value for delete-gating logic.
if [[ "$1" == "s3api" && "$2" == "get-bucket-tagging" ]]; then
  echo "${FAKE_TAG_VALUE:-None}"
  exit 0
fi

# Treat recursive S3 object deletion as successful.
if [[ "$1" == "s3" && "$2" == "rm" ]]; then
  exit 0
fi

# Treat bucket deletion as successful.
if [[ "$1" == "s3api" && "$2" == "delete-bucket" ]]; then
  exit 0
fi

# Simulate table existence checks; default to "not found" unless overridden.
if [[ "$1" == "dynamodb" && "$2" == "describe-table" ]]; then
  if [[ "${FAKE_DESCRIBE_TABLE_EXISTS:-0}" == "1" ]]; then
    exit 0
  fi
  exit 1
fi

# Return an empty scan page to satisfy export flow without fixture data.
if [[ "$1" == "dynamodb" && "$2" == "scan" ]]; then
  echo '{"Items":[]}'
  exit 0
fi

# Treat DynamoDB table deletion as successful.
if [[ "$1" == "dynamodb" && "$2" == "delete-table" ]]; then
  exit 0
fi

# Treat DynamoDB waiters as immediately successful.
if [[ "$1" == "dynamodb" && "$2" == "wait" ]]; then
  exit 0
fi

# Fail fast on unhandled AWS calls to keep tests strict.
echo "unexpected aws call: $*" >&2
exit 1
EOF
  fi

  cat > "$dir/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >> "${PNPM_LOG_FILE:?}"
exit 0
EOF

  chmod +x "$dir/pnpm"
  if [[ "$include_aws" == "1" ]]; then
    chmod +x "$dir/aws"
  fi
}

setup_test_infra_scripts() {
  local infra_dir="$1"
  mkdir -p "$infra_dir/scripts"
  cp "$ROOT_DIR/infra/scripts/infra-down.sh" "$infra_dir/scripts/infra-down.sh"
  cp "$ROOT_DIR/infra/scripts/env.sh" "$infra_dir/scripts/env.sh"

  cat > "$infra_dir/scripts/dynamodb-export.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "export called" >> "${DYNAMODB_EXPORT_LOG_FILE:?}"
exit 0
EOF

  chmod +x "$infra_dir/scripts/infra-down.sh" "$infra_dir/scripts/dynamodb-export.sh"
}

run_infra_down_capture() {
  local tmp
  tmp=$(mktemp -d)

  mkdir -p "$tmp/bin"
  setup_fake_binaries "$tmp/bin"
  setup_test_infra_scripts "$tmp/infra"

  local env_file="$tmp/.env"
  cat > "$env_file" <<EOF
AWS_REGION=us-west-2
HEXES_TABLE_NAME=test-hexes
SERVICE_BUCKET_NAME=${SERVICE_BUCKET_NAME_OVERRIDE:-}
EOF

  : > "$tmp/aws.log"
  : > "$tmp/pnpm.log"
  : > "$tmp/export.log"

  local run_path="$tmp/bin:$PATH"
  if [[ "${TEST_PATH_MODE:-full}" == "bin_only" ]]; then
    run_path="$tmp/bin"
  fi

  if AWS_LOG_FILE="$tmp/aws.log" \
    PNPM_LOG_FILE="$tmp/pnpm.log" \
    DYNAMODB_EXPORT_LOG_FILE="$tmp/export.log" \
    ENV_FILE="$env_file" \
    PATH="$run_path" \
    FAKE_TAG_VALUE="${FAKE_TAG_VALUE:-None}" \
    FAKE_HEAD_BUCKET_EXISTS="${FAKE_HEAD_BUCKET_EXISTS:-1}" \
    FAKE_ACCOUNT_ID="${FAKE_ACCOUNT_ID:-123456789012}" \
    FAKE_DESCRIBE_TABLE_EXISTS="${FAKE_DESCRIBE_TABLE_EXISTS:-0}" \
    FAKE_INCLUDE_AWS="${FAKE_INCLUDE_AWS:-1}" \
    TEST_PATH_MODE="${TEST_PATH_MODE:-full}" \
    "$TEST_BASH" "$tmp/infra/scripts/infra-down.sh" "$@" >"$tmp/out.log" 2>&1; then
    TEST_EXIT_CODE=0
  else
    TEST_EXIT_CODE=$?
  fi

  TEST_OUTPUT=$(cat "$tmp/out.log")
  TEST_AWS_LOG=$(cat "$tmp/aws.log")
  TEST_PNPM_LOG=$(cat "$tmp/pnpm.log")
  TEST_EXPORT_LOG=$(cat "$tmp/export.log")
  rm -rf "$tmp"
}

run_infra_down() {
  run_infra_down_capture "$@"
  if [[ "$TEST_EXIT_CODE" -ne 0 ]]; then
    echo "infra-down invocation failed:"
    echo "$TEST_OUTPUT"
    exit 1
  fi
}

run_infra_down_expect_fail() {
  run_infra_down_capture "$@"
  if [[ "$TEST_EXIT_CODE" -eq 0 ]]; then
    echo "ASSERT FAILED: expected infra-down invocation to fail"
    exit 1
  fi
}

test_deletes_managed_bucket() {
  SERVICE_BUCKET_NAME_OVERRIDE="my-service-bucket" \
  FAKE_TAG_VALUE="chult-infra-up" \
  run_infra_down --delete-service-bucket

  assert_contains "$TEST_OUTPUT" "Deleting service bucket my-service-bucket..."
  assert_contains "$TEST_AWS_LOG" "aws s3 rm s3://my-service-bucket --recursive"
  assert_contains "$TEST_AWS_LOG" "aws s3api delete-bucket --bucket my-service-bucket --region us-west-2"
}

test_skips_legacy_bucket_delete() {
  SERVICE_BUCKET_NAME_OVERRIDE="my-service-bucket" \
  FAKE_TAG_VALUE="None" \
  run_infra_down --delete-service-bucket

  assert_contains "$TEST_OUTPUT" "Skipping delete for legacy/non-managed bucket my-service-bucket"
  assert_not_contains "$TEST_AWS_LOG" "aws s3 rm s3://my-service-bucket --recursive"
  assert_not_contains "$TEST_AWS_LOG" "aws s3api delete-bucket --bucket my-service-bucket --region us-west-2"
}

test_uses_default_bucket_name_when_config_invalid() {
  SERVICE_BUCKET_NAME_OVERRIDE="INVALID_BUCKET_NAME" \
  FAKE_TAG_VALUE="None" \
  run_infra_down --delete-service-bucket

  assert_contains "$TEST_OUTPUT" "Skipping delete for legacy/non-managed bucket chult-map-service-123456789012-us-west-2"
}

test_preserves_bucket_without_flag() {
  SERVICE_BUCKET_NAME_OVERRIDE="my-service-bucket" run_infra_down
  assert_contains "$TEST_OUTPUT" "Service bucket preserved: my-service-bucket"
}

test_deletes_db_table_when_requested() {
  FAKE_DESCRIBE_TABLE_EXISTS=1 run_infra_down --delete-db-table

  assert_contains "$TEST_OUTPUT" "Exporting DynamoDB table before delete..."
  assert_contains "$TEST_OUTPUT" "Deleted DynamoDB table test-hexes."
  assert_contains "$TEST_EXPORT_LOG" "export called"
  assert_contains "$TEST_AWS_LOG" "aws dynamodb delete-table --table-name test-hexes --region us-west-2"
  assert_contains "$TEST_AWS_LOG" "aws dynamodb wait table-not-exists --table-name test-hexes --region us-west-2"
}

test_skips_db_delete_when_table_missing() {
  FAKE_DESCRIBE_TABLE_EXISTS=0 run_infra_down --delete-db-table

  assert_contains "$TEST_OUTPUT" "DynamoDB table test-hexes does not exist. Skipping delete."
  assert_contains "$TEST_EXPORT_LOG" "export called"
  assert_not_contains "$TEST_AWS_LOG" "aws dynamodb delete-table --table-name test-hexes --region us-west-2"
}

test_fails_on_unknown_arg() {
  run_infra_down_expect_fail --unknown-flag

  assert_contains "$TEST_OUTPUT" "ERROR: Unknown argument: --unknown-flag"
  assert_contains "$TEST_OUTPUT" "Usage:"
  assert_not_contains "$TEST_PNPM_LOG" "pnpm --dir"
}

test_fails_when_aws_missing() {
  FAKE_INCLUDE_AWS=0 TEST_PATH_MODE=bin_only run_infra_down_expect_fail
  assert_contains "$TEST_OUTPUT" "ERROR: aws CLI is required but was not found in PATH."
  assert_not_contains "$TEST_PNPM_LOG" "pnpm --dir"
}

main() {
  test_deletes_managed_bucket
  test_skips_legacy_bucket_delete
  test_uses_default_bucket_name_when_config_invalid
  test_preserves_bucket_without_flag
  test_deletes_db_table_when_requested
  test_skips_db_delete_when_table_missing
  test_fails_on_unknown_arg
  test_fails_when_aws_missing
  echo "infra-down tests passed"
}

main
