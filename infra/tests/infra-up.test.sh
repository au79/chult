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
  local include_jq="${FAKE_INCLUDE_JQ:-1}"

  ln -s "$(command -v dirname)" "$dir/dirname"
  ln -s "$(command -v date)" "$dir/date"

  if [[ "$include_aws" == "1" ]]; then
    cat > "$dir/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "aws $*" >> "${AWS_LOG_FILE:?}"

# Return a fake Account ID.
if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then
  echo "${FAKE_ACCOUNT_ID:-123456789012}"
  exit 0
fi

# Return role details needed by ensure_lambda_role.
if [[ "$1" == "iam" && "$2" == "get-role" ]]; then
  if [[ "$*" == *"Role.AssumeRolePolicyDocument"* ]]; then
    cat <<'JSON'
{"Statement":[{"Action":"sts:AssumeRole","Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"}}],"Version":"2012-10-17"}
JSON
    exit 0
  fi
  if [[ "$*" == *"PermissionsBoundary.PermissionsBoundaryArn"* ]]; then
    echo "None"
    exit 0
  fi
  exit 0
fi

# Return success for IAM role mutation operations.
if [[ "$1" == "iam" && ( "$2" == "create-role" || "$2" == "put-role-policy" || "$2" == "delete-role-policy" || "$2" == "attach-role-policy" ) ]]; then
  exit 0
fi

# Return configurable existence for service bucket checks.
if [[ "$1" == "s3api" && "$2" == "head-bucket" ]]; then
  if [[ "${FAKE_HEAD_BUCKET_EXISTS:-1}" == "1" ]]; then
    exit 0
  fi
  exit 1
fi

# Return success for bucket creation and hardening calls.
if [[ "$1" == "s3api" && ( "$2" == "create-bucket" || "$2" == "put-bucket-encryption" || "$2" == "put-public-access-block" || "$2" == "put-bucket-tagging" || "$2" == "put-bucket-policy" ) ]]; then
  exit 0
fi

# Return no existing bucket policy so script seeds a default policy.
if [[ "$1" == "s3api" && "$2" == "get-bucket-policy" ]]; then
  exit 1
fi

# Return configurable existence for DynamoDB table checks.
if [[ "$1" == "dynamodb" && "$2" == "describe-table" ]]; then
  if [[ "${FAKE_DDB_TABLE_EXISTS:-1}" == "1" ]]; then
    exit 0
  fi
  exit 1
fi

# Return success for DynamoDB create and waiter operations.
if [[ "$1" == "dynamodb" && ( "$2" == "create-table" || "$2" == "wait" ) ]]; then
  exit 0
fi

# Return fake CloudFormation outputs for cert and distribution lookups.
if [[ "$1" == "cloudformation" && "$2" == "describe-stacks" ]]; then
  if [[ "$*" == *"ChultServiceStack"* ]]; then
    echo "${FAKE_DISTRIBUTION_ID:-DIST123}"
    exit 0
  fi
  if [[ "$*" == *"ChultCloudFrontCertStack"* ]]; then
    echo "${FAKE_CERT_ARN:-arn:aws:acm:us-east-1:123456789012:certificate/fake}"
    exit 0
  fi
fi

# Return success for static asset sync.
if [[ "$1" == "s3" && "$2" == "sync" ]]; then
  exit 0
fi

# Return success for CloudFront invalidation.
if [[ "$1" == "cloudfront" && "$2" == "create-invalidation" ]]; then
  exit 0
fi

# Fail fast on any unhandled aws command.
echo "unexpected aws call: $*" >&2
exit 1
EOF
    chmod +x "$dir/aws"
  fi

  if [[ "$include_jq" == "1" ]]; then
    cat > "$dir/jq" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/homebrew/bin/jq "$@"
EOF
    chmod +x "$dir/jq"
  fi

  cat > "$dir/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >> "${PNPM_LOG_FILE:?}"
exit 0
EOF

  chmod +x "$dir/pnpm"
}

setup_test_infra_scripts() {
  local infra_dir="$1"
  mkdir -p "$infra_dir/scripts" "$infra_dir/iam"
  cp "$ROOT_DIR/infra/scripts/infra-up.sh" "$infra_dir/scripts/infra-up.sh"
  cp "$ROOT_DIR/infra/scripts/env.sh" "$infra_dir/scripts/env.sh"
  cp "$ROOT_DIR/infra/iam/lambda-trust-policy.json" "$infra_dir/iam/lambda-trust-policy.json"

  cat > "$infra_dir/scripts/push-ecr-image.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "push-ecr-image called" >> "${PUSH_LOG_FILE:?}"
exit 0
EOF

  chmod +x "$infra_dir/scripts/infra-up.sh" "$infra_dir/scripts/push-ecr-image.sh"
}

run_infra_up_capture() {
  local tmp
  tmp=$(mktemp -d)

  mkdir -p "$tmp/bin"
  setup_fake_binaries "$tmp/bin"
  setup_test_infra_scripts "$tmp/infra"

  local env_file="$tmp/.env"
  cat > "$env_file" <<EOF
AWS_REGION=us-west-2
ROLE_NAME=ChultLambdaExecutionRole
HEXES_TABLE_NAME=test-hexes
SERVICE_BUCKET_NAME=${SERVICE_BUCKET_NAME_OVERRIDE:-}
REPO_NAME=chult-map-service
EOF

  : > "$tmp/aws.log"
  : > "$tmp/pnpm.log"
  : > "$tmp/push.log"

  local run_path="$tmp/bin:$PATH"
  if [[ "${TEST_PATH_MODE:-full}" == "bin_only" ]]; then
    run_path="$tmp/bin"
  fi

  if AWS_LOG_FILE="$tmp/aws.log" \
    PNPM_LOG_FILE="$tmp/pnpm.log" \
    PUSH_LOG_FILE="$tmp/push.log" \
    ENV_FILE="$env_file" \
    PATH="$run_path" \
    FAKE_INCLUDE_AWS="${FAKE_INCLUDE_AWS:-1}" \
    FAKE_INCLUDE_JQ="${FAKE_INCLUDE_JQ:-1}" \
    FAKE_ACCOUNT_ID="${FAKE_ACCOUNT_ID:-123456789012}" \
    FAKE_HEAD_BUCKET_EXISTS="${FAKE_HEAD_BUCKET_EXISTS:-1}" \
    FAKE_DDB_TABLE_EXISTS="${FAKE_DDB_TABLE_EXISTS:-1}" \
    TEST_PATH_MODE="${TEST_PATH_MODE:-full}" \
    "$TEST_BASH" "$tmp/infra/scripts/infra-up.sh" >"$tmp/out.log" 2>&1; then
    TEST_EXIT_CODE=0
  else
    TEST_EXIT_CODE=$?
  fi

  TEST_OUTPUT=$(cat "$tmp/out.log")
  TEST_AWS_LOG=$(cat "$tmp/aws.log")
  TEST_PNPM_LOG=$(cat "$tmp/pnpm.log")
  TEST_PUSH_LOG=$(cat "$tmp/push.log")
  rm -rf "$tmp"
}

run_infra_up() {
  run_infra_up_capture
  if [[ "$TEST_EXIT_CODE" -ne 0 ]]; then
    echo "infra-up invocation failed:"
    echo "$TEST_OUTPUT"
    exit 1
  fi
}

run_infra_up_expect_fail() {
  run_infra_up_capture
  if [[ "$TEST_EXIT_CODE" -eq 0 ]]; then
    echo "ASSERT FAILED: expected infra-up invocation to fail"
    exit 1
  fi
}

test_existing_bucket_skips_create_and_tagging() {
  SERVICE_BUCKET_NAME_OVERRIDE="my-service-bucket" \
  FAKE_HEAD_BUCKET_EXISTS=1 \
  run_infra_up

  assert_contains "$TEST_OUTPUT" "Bucket my-service-bucket already exists."
  assert_not_contains "$TEST_AWS_LOG" "aws s3api create-bucket --bucket my-service-bucket"
  assert_not_contains "$TEST_AWS_LOG" "aws s3api put-bucket-tagging --bucket my-service-bucket"
  assert_contains "$TEST_PUSH_LOG" "push-ecr-image called"
}

test_missing_bucket_creates_and_tags() {
  SERVICE_BUCKET_NAME_OVERRIDE="my-service-bucket" \
  FAKE_HEAD_BUCKET_EXISTS=0 \
  run_infra_up

  assert_contains "$TEST_OUTPUT" "Creating bucket my-service-bucket in us-west-2..."
  assert_contains "$TEST_AWS_LOG" "aws s3api create-bucket --bucket my-service-bucket --region us-west-2 --create-bucket-configuration LocationConstraint=us-west-2"
  assert_contains "$TEST_AWS_LOG" "aws s3api put-bucket-tagging --bucket my-service-bucket --tagging TagSet=[{Key=ManagedBy,Value=chult-infra-up},{Key=Project,Value=chult},{Key=ManagedResource,Value=service-bucket}]"
}

test_invalid_configured_bucket_falls_back_to_default() {
  SERVICE_BUCKET_NAME_OVERRIDE="INVALID_BUCKET_NAME" run_infra_up
  assert_contains "$TEST_OUTPUT" "WARNING: SERVICE_BUCKET_NAME is invalid. Falling back to default service bucket name."
  assert_contains "$TEST_OUTPUT" "Default service bucket name: chult-map-service-123456789012-us-west-2"
}

test_fails_when_aws_missing() {
  FAKE_INCLUDE_AWS=0 TEST_PATH_MODE=bin_only run_infra_up_expect_fail
  assert_contains "$TEST_OUTPUT" "ERROR: aws CLI is required but was not found in PATH."
}

main() {
  test_existing_bucket_skips_create_and_tagging
  test_missing_bucket_creates_and_tags
  test_invalid_configured_bucket_falls_back_to_default
  test_fails_when_aws_missing
  echo "infra-up tests passed"
}

main
