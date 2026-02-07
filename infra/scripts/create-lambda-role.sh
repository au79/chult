#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

ROLE_NAME=${ROLE_NAME:-ChultLambdaExecutionRole}
TRUST_POLICY_PATH=${TRUST_POLICY_PATH:-"$INFRA_DIR/iam/lambda-trust-policy.json"}
BOUNDARY_ARN=${BOUNDARY_ARN:-}

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but was not found in PATH."
  exit 1
fi

if [[ "$TRUST_POLICY_PATH" != /* ]]; then
  TRUST_POLICY_PATH="$PWD/$TRUST_POLICY_PATH"
fi

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Role $ROLE_NAME already exists. Skipping create-role."
else
  create_role_args=(
    --role-name "$ROLE_NAME"
    --assume-role-policy-document "file://$TRUST_POLICY_PATH"
  )

  if [[ -n "$BOUNDARY_ARN" ]]; then
    create_role_args+=(--permissions-boundary "$BOUNDARY_ARN")
  fi

  aws iam create-role "${create_role_args[@]}" >/dev/null
  echo "Created role $ROLE_NAME."
fi

current_trust_json=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.AssumeRolePolicyDocument' --output json)
expected_trust_json=$(jq -S . "$TRUST_POLICY_PATH")
current_trust_sorted=$(jq -S . <<< "$current_trust_json")

if [[ "$current_trust_sorted" != "$expected_trust_json" ]]; then
  echo "ERROR: Role trust policy does not match $TRUST_POLICY_PATH."
  exit 1
fi

current_boundary=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.PermissionsBoundary.PermissionsBoundaryArn' --output text 2>/dev/null || true)
if [[ -n "$BOUNDARY_ARN" ]]; then
  if [[ "$current_boundary" != "$BOUNDARY_ARN" ]]; then
    echo "ERROR: Role permissions boundary does not match BOUNDARY_ARN."
    echo "Expected: $BOUNDARY_ARN"
    echo "Found: $current_boundary"
    exit 1
  fi
else
  if [[ "$current_boundary" != "None" && -n "$current_boundary" ]]; then
    echo "ERROR: Role has a permissions boundary set but BOUNDARY_ARN is empty."
    echo "Found: $current_boundary"
    exit 1
  fi
fi

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly \
  >/dev/null

echo "Ensured AmazonEC2ContainerRegistryReadOnly is attached."
