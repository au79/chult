#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ROOT_DIR=$(cd "$INFRA_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"

HOSTED_ZONE_ID=${HOSTED_ZONE_ID:-}
HOSTED_ZONE_NAME=${HOSTED_ZONE_NAME:-}
SUBDOMAIN=${SUBDOMAIN:-}
TIMESTAMP_TAG=${TIMESTAMP_TAG:-$(date -u +"%Y%m%d%H%M%S")}
IMAGE_TAG=${IMAGE_TAG:-$TIMESTAMP_TAG}

HAS_HOSTED_ZONE_ID=0
HAS_HOSTED_ZONE_NAME=0
HAS_SUBDOMAIN=0

if [[ -n "$HOSTED_ZONE_ID" ]]; then
  HAS_HOSTED_ZONE_ID=1
fi
if [[ -n "$HOSTED_ZONE_NAME" ]]; then
  HAS_HOSTED_ZONE_NAME=1
fi
if [[ -n "$SUBDOMAIN" ]]; then
  HAS_SUBDOMAIN=1
fi

USE_CUSTOM_DOMAIN=0
if [[ $HAS_HOSTED_ZONE_ID -eq 1 || $HAS_HOSTED_ZONE_NAME -eq 1 || $HAS_SUBDOMAIN -eq 1 ]]; then
  if [[ $HAS_HOSTED_ZONE_ID -eq 1 && $HAS_HOSTED_ZONE_NAME -eq 1 && $HAS_SUBDOMAIN -eq 1 ]]; then
    USE_CUSTOM_DOMAIN=1
  else
    echo "ERROR: Custom domain requires HOSTED_ZONE_ID, HOSTED_ZONE_NAME, and SUBDOMAIN together."
    exit 1
  fi
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required but was not found in PATH."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but was not found in PATH."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm is required but was not found in PATH."
  exit 1
fi

echo "Infra config:"
echo "  ENV_FILE=${ENV_FILE:-$INFRA_DIR/.env}"
echo "  AWS_REGION=$AWS_REGION"
echo "  HOSTED_ZONE_ID=$HOSTED_ZONE_ID"
echo "  HOSTED_ZONE_NAME=$HOSTED_ZONE_NAME"
echo "  SUBDOMAIN=$SUBDOMAIN"
if [[ $USE_CUSTOM_DOMAIN -eq 1 ]]; then
  echo "  CUSTOM_DOMAIN_MODE=enabled"
  echo "  FULL_DOMAIN=${SUBDOMAIN}.${HOSTED_ZONE_NAME}"
else
  echo "  CUSTOM_DOMAIN_MODE=disabled (using CloudFront default domain)"
  echo "  FULL_DOMAIN=(none)"
fi
echo "  ROLE_NAME=$ROLE_NAME"
echo "  SERVICE_BUCKET_NAME=$SERVICE_BUCKET_NAME"
echo "  REPO_NAME=$REPO_NAME"
echo "  IMAGE_TAG=$IMAGE_TAG"

ensure_lambda_role() {
  TRUST_POLICY_PATH="$INFRA_DIR/iam/lambda-trust-policy.json"

  if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    echo "Role $ROLE_NAME already exists. Skipping create-role."
  else
    create_role_args=(
      --role-name "$ROLE_NAME"
      --assume-role-policy-document "file://$TRUST_POLICY_PATH"
    )

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
  if [[ "$current_boundary" != "None" && -n "$current_boundary" ]]; then
    echo "ERROR: Role has a permissions boundary set but this setup expects none."
    echo "Found: $current_boundary"
    exit 1
  fi

  s3_policy=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::${SERVICE_BUCKET_NAME}"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::${SERVICE_BUCKET_NAME}/*"
    }
  ]
}
EOF
)

  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "ChultHexIdS3Access" \
    --policy-document "$s3_policy" \
    >/dev/null

  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly \
    >/dev/null

  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
    >/dev/null

  echo "Ensured AmazonEC2ContainerRegistryReadOnly and AWSLambdaBasicExecutionRole are attached."
}

ensure_service_bucket() {
  if aws s3api head-bucket --bucket "$SERVICE_BUCKET_NAME" >/dev/null 2>&1; then
    echo "Bucket $SERVICE_BUCKET_NAME already exists."
    return 0
  fi

  echo "Creating bucket $SERVICE_BUCKET_NAME in $AWS_REGION..."

  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$SERVICE_BUCKET_NAME"
  else
    aws s3api create-bucket \
      --bucket "$SERVICE_BUCKET_NAME" \
      --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
  fi

  aws s3api put-bucket-encryption \
    --bucket "$SERVICE_BUCKET_NAME" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

  aws s3api put-public-access-block \
    --bucket "$SERVICE_BUCKET_NAME" \
    --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'

  echo "Bucket $SERVICE_BUCKET_NAME created and locked down."
}

ensure_lambda_role

CLOUDFRONT_CERT_ARN=""
if [[ $USE_CUSTOM_DOMAIN -eq 1 ]]; then
  echo "Deploying ChultCloudFrontCertStack with custom-domain parameters..."
  pnpm --dir "$INFRA_DIR" cdk deploy ChultCloudFrontCertStack --require-approval never \
    --parameters HostedZoneId="$HOSTED_ZONE_ID" \
    --parameters HostedZoneName="$HOSTED_ZONE_NAME" \
    --parameters Subdomain="$SUBDOMAIN"

  CLOUDFRONT_CERT_ARN=$(aws cloudformation describe-stacks \
    --stack-name ChultCloudFrontCertStack \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontCertArn`].OutputValue' \
    --output text)

  if [[ -z "$CLOUDFRONT_CERT_ARN" || "$CLOUDFRONT_CERT_ARN" == "None" ]]; then
    echo "ERROR: CloudFront certificate ARN not found after deploy."
    exit 1
  fi
else
  echo "Skipping ChultCloudFrontCertStack deploy (custom domain disabled)."
fi

export IMAGE_TAG REPO_NAME AWS_REGION
"$INFRA_DIR/scripts/push-ecr-image.sh"
ensure_service_bucket

service_deploy_args=(
  --parameters ImageTag="$IMAGE_TAG"
  --parameters ServiceBucketName="$SERVICE_BUCKET_NAME"
)

if [[ $USE_CUSTOM_DOMAIN -eq 1 ]]; then
  echo "Deploying ChultServiceStack with custom-domain parameters..."
  service_deploy_args+=(
    --parameters HostedZoneId="$HOSTED_ZONE_ID"
    --parameters HostedZoneName="$HOSTED_ZONE_NAME"
    --parameters Subdomain="$SUBDOMAIN"
    --parameters CloudFrontCertArn="$CLOUDFRONT_CERT_ARN"
  )
else
  echo "Deploying ChultServiceStack without custom-domain parameters..."
fi

pnpm --dir "$INFRA_DIR" cdk deploy ChultServiceStack --require-approval never \
  "${service_deploy_args[@]}"

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name ChultServiceStack \
  --region "${AWS_REGION:-us-west-2}" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

if [[ -z "$DISTRIBUTION_ID" || "$DISTRIBUTION_ID" == "None" ]]; then
  echo "ERROR: CloudFront distribution ID not found after deploy."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
DIST_ARN="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DISTRIBUTION_ID}"
OBJECT_ARN="arn:aws:s3:::${SERVICE_BUCKET_NAME}/*"

TMP_POLICY=$(mktemp)

if aws s3api get-bucket-policy --bucket "$SERVICE_BUCKET_NAME" >/dev/null 2>&1; then
  aws s3api get-bucket-policy --bucket "$SERVICE_BUCKET_NAME" --query Policy --output text > "$TMP_POLICY"
else
  echo '{"Version":"2012-10-17","Statement":[]}' > "$TMP_POLICY"
fi

jq --arg distArn "$DIST_ARN" --arg objectArn "$OBJECT_ARN" '
  .Statement |= map(select(.Sid != "AllowCloudFrontOACRead"))
  | .Statement += [
      {
        "Sid": "AllowCloudFrontOACRead",
        "Effect": "Allow",
        "Principal": {"Service": "cloudfront.amazonaws.com"},
        "Action": ["s3:GetObject"],
        "Resource": [$objectArn],
        "Condition": {"StringEquals": {"AWS:SourceArn": $distArn}}
      }
    ]
' "$TMP_POLICY" > "$TMP_POLICY.new"

aws s3api put-bucket-policy --bucket "$SERVICE_BUCKET_NAME" --policy file://"$TMP_POLICY.new"

rm -f "$TMP_POLICY" "$TMP_POLICY.new"

echo "Updated bucket policy to allow CloudFront distribution $DISTRIBUTION_ID."

aws s3 sync "$ROOT_DIR/client/public" "s3://$SERVICE_BUCKET_NAME" \
  --delete \
  --exclude "shown-hexes.txt"

echo "Synced client assets to s3://$SERVICE_BUCKET_NAME"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" >/dev/null
echo "Invalidated CloudFront distribution $DISTRIBUTION_ID"

printf "\nInfra up complete. CloudFront distribution: %s\n" "$DISTRIBUTION_ID"
