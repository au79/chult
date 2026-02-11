#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INFRA_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ROOT_DIR=$(cd "$INFRA_DIR/.." && pwd)
source "$SCRIPT_DIR/env.sh"

HOSTED_ZONE_ID=${HOSTED_ZONE_ID:-Z1AXYSRIQ6QRQO}
HOSTED_ZONE_NAME=${HOSTED_ZONE_NAME:-oolong.com}
SUBDOMAIN=${SUBDOMAIN:-chult}
TIMESTAMP_TAG=${TIMESTAMP_TAG:-$(date -u +"%Y%m%d%H%M%S")}
IMAGE_TAG=${IMAGE_TAG:-$TIMESTAMP_TAG}

if [[ -z "$HOSTED_ZONE_ID" ]]; then
  echo "ERROR: HOSTED_ZONE_ID is required."
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

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm is required but was not found in PATH."
  exit 1
fi

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
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::${STATIC_BUCKET_NAME}/*"
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

ensure_static_bucket() {
  if aws s3api head-bucket --bucket "$STATIC_BUCKET_NAME" >/dev/null 2>&1; then
    echo "Bucket $STATIC_BUCKET_NAME already exists."
    return 0
  fi

  echo "Creating bucket $STATIC_BUCKET_NAME in $AWS_REGION..."

  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$STATIC_BUCKET_NAME"
  else
    aws s3api create-bucket \
      --bucket "$STATIC_BUCKET_NAME" \
      --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
  fi

  aws s3api put-bucket-encryption \
    --bucket "$STATIC_BUCKET_NAME" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

  aws s3api put-public-access-block \
    --bucket "$STATIC_BUCKET_NAME" \
    --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'

  echo "Bucket $STATIC_BUCKET_NAME created and locked down."
}

ensure_lambda_role

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

export IMAGE_TAG REPO_NAME AWS_REGION
"$INFRA_DIR/scripts/push-ecr-image.sh"
ensure_static_bucket

pnpm --dir "$INFRA_DIR" cdk deploy ChultServiceStack --require-approval never \
  --parameters HostedZoneId="$HOSTED_ZONE_ID" \
  --parameters ImageTag="$IMAGE_TAG" \
  --parameters StaticBucketName="$STATIC_BUCKET_NAME" \
  --parameters CloudFrontCertArn="$CLOUDFRONT_CERT_ARN"

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
OBJECT_ARN="arn:aws:s3:::${STATIC_BUCKET_NAME}/*"

TMP_POLICY=$(mktemp)

if aws s3api get-bucket-policy --bucket "$STATIC_BUCKET_NAME" >/dev/null 2>&1; then
  aws s3api get-bucket-policy --bucket "$STATIC_BUCKET_NAME" --query Policy --output text > "$TMP_POLICY"
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

aws s3api put-bucket-policy --bucket "$STATIC_BUCKET_NAME" --policy file://"$TMP_POLICY.new"

rm -f "$TMP_POLICY" "$TMP_POLICY.new"

echo "Updated bucket policy to allow CloudFront distribution $DISTRIBUTION_ID."

aws s3 sync "$ROOT_DIR/client/public" "s3://$STATIC_BUCKET_NAME" --delete

echo "Synced static assets to s3://$STATIC_BUCKET_NAME"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" >/dev/null
echo "Invalidated CloudFront distribution $DISTRIBUTION_ID"

printf "\nInfra up complete. CloudFront distribution: %s\n" "$DISTRIBUTION_ID"
