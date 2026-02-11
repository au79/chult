# AWS Resources for chult.oolong.com

This document lists the AWS resources needed to securely host the Docker-based service (Lambda Function URL + CloudFront) and expose it as `chult.oolong.com`. CDK code lives in this directory under `bin/` and `lib/`.

## Core service path

1. **Container image registry (ECR)**
   - Private ECR repository to store the built Docker image.
   - Lifecycle policy to expire old images.

2. **Lambda function (container image)**
   - Lambda function created from the ECR image.
   - Memory/timeout configured for the service.
   - Environment variables for runtime configuration (if any).
   - **Execution role** with least-privilege permissions (ECR pull).

3. **Lambda Function URL**
   - Public Function URL for API requests.
   - CORS allows `https://chult.oolong.com`.

4. **Static assets (S3 + CloudFront)**
   - Existing S3 bucket for `client/public` assets (private, OAC access).
   - CloudFront distribution serving the bucket by default.
   - CloudFront behavior `/api/*` routes to the Function URL.
   - CloudFront behavior `/health` routes to the Function URL.

5. **TLS/SSL certificates (ACM)**
   - CloudFront ACM certificate (us-east-1) for `chult.oolong.com`.
   - DNS validation via Route 53.

6. **DNS (Route 53)**
   - Hosted zone for `oolong.com` (already owned).
   - **A/AAAA alias record** for `chult.oolong.com` pointing to CloudFront.
   - Validation records for ACM (created automatically or manually).

## Security and hardening
- **HTTPS to viewers** via CloudFront.
- **Least privilege IAM** for Lambda execution and deployment roles.
- **WAF (AWS WAFv2)** attached to CloudFront for basic protections (optional but recommended).

## Networking considerations

- Lambda remains outside a VPC for simplicity and lower latency.

## Deployment pipeline (minimum viable)

- Build and push Docker image to ECR.
- Update Lambda to the new image tag.
- Upload `client/public` to S3.
- CloudFront serves static assets and routes `/api/*` and `/health` to the Function URL.
- Route 53 alias record resolves `chult.oolong.com` to CloudFront.

## CDK usage

The CDK app uses CloudFormation parameters for account-specific details:

- `HostedZoneId` (required)
- `HostedZoneName` (default: `oolong.com`)
- `Subdomain` (default: `chult`)
- `ImageTag` (default: `latest`)
- `EcrRepositoryName` (default: `chult-map-service`)
- `LambdaRoleName` (default: `ChultLambdaExecutionRole`)
- `StaticBucketName` (default: `oolong-chult-map-service`, must already exist)
- `CloudFrontCertArn` (required)

CloudFront certificate stack (us-east-1):

- Stack name: `ChultCloudFrontCertStack`
- Outputs: `CloudFrontCertArn`

Example deploy:

```bash
pnpm --dir infra install
pnpm --dir infra cdk bootstrap
pnpm --dir infra infra:up
```

## ACM validation note

The CloudFront certificate uses DNS validation via Route 53. CDK will create the validation records in the hosted zone and wait for validation to complete before finishing the deploy.

## Manual IAM role setup

Create the Lambda execution role outside this stack, then pass its name via `LambdaRoleName` (or rely on the default).

Artifacts:

- Trust policy: `infra/iam/lambda-trust-policy.json`
- Defaults: `infra/scripts/env.sh`

`infra:up` creates/verifies the IAM role on every run.

Prerequisite:

- `jq` must be installed and available in `PATH`.

Optional environment variables:

- `ROLE_NAME` (default: `ChultLambdaExecutionRole`)

The script attaches:

- `AmazonEC2ContainerRegistryReadOnly`
- `AWSLambdaBasicExecutionRole` (for CloudWatch logs)
- Inline policy `ChultHexIdS3Access` for reading/writing the hex ID file in the static bucket

## Package scripts

From repo root:

- `pnpm --dir infra build` compiles the CDK app.
- `pnpm --dir infra watch` runs TypeScript in watch mode.
- `pnpm --dir infra synth` synthesizes the CloudFormation template.
- `pnpm --dir infra deploy` deploys the stack.
- `pnpm --dir infra destroy` tears down the stack.
- `pnpm --dir infra cdk` runs any raw CDK command.
- `pnpm ecr:push` builds the Docker image and pushes it to ECR.
- `pnpm --dir infra ensure-static-bucket` creates the static S3 bucket if missing.
- `pnpm --dir infra infra:up` provisions everything (cert, image push, Lambda, CloudFront, bucket access, static sync, invalidation).
- `pnpm --dir infra infra:down` tears down the stacks but keeps the static bucket.

`pnpm ecr:push` environment overrides:

- `REPO_NAME` (default: `chult-map-service`)
- `IMAGE_TAG` (default: `latest`)
- `AWS_REGION` (default: `us-west-2`)

`pnpm --dir infra ensure-static-bucket` environment overrides:

- `STATIC_BUCKET_NAME` (default: `oolong-chult-map-service`)
- `AWS_REGION` (default: `us-west-2`)

`pnpm --dir infra infra:up` environment overrides:
- `HOSTED_ZONE_ID` (default: `Z1AXYSRIQ6QRQO`)
- `HOSTED_ZONE_NAME` (default: `oolong.com`)
- `SUBDOMAIN` (default: `chult`)
- `REPO_NAME` (default: `chult-map-service`)
- `IMAGE_TAG` (default: UTC timestamp tag)
- `TIMESTAMP_TAG` (optional override for timestamp generation)
- `STATIC_BUCKET_NAME` (default: `oolong-chult-map-service`)
- `AWS_REGION` (default: `us-west-2`)
- `ROLE_NAME` (default: `ChultLambdaExecutionRole`)
- `HEX_ID_STORAGE` (`s3` when running in Lambda, `local` otherwise)

`pnpm --dir infra infra:down` has no environment overrides.

Hex IDs are stored in S3 under the same filename as the local data file (default `shown-hexes.txt`).
