# Chult Infra

CDK app and shell scripts for deploying the service stack.

## Requirements

Install these before running infra scripts:

- Node.js `>=22.21.0`
- pnpm `>=9.5.0`
- `aws` CLI v2 (used by all infra scripts)
- `docker` with `buildx` enabled (required for image build/push)
- `jq` (required by `infra:up`, `dynamodb:export`, and `dynamodb:import`)

AWS setup requirements:

- Valid AWS credentials/profile in your shell environment
- Permission to use ECR, IAM, Lambda, CloudFormation, S3, DynamoDB, CloudFront, and (for custom domains) Route53 + ACM
- CDK bootstrapped in target account/region (`pnpm --dir infra cdk bootstrap`)

## What Gets Deployed

- ECR-backed Lambda (container image)
- Lambda Function URL (origin for API routes)
- S3 bucket for static assets
- CloudFront distribution:
  - default behavior -> S3 (`player.html`)
  - `api/*` and `health` -> Lambda Function URL
- Route53 + ACM cert (only when custom domain env vars are set)
- DynamoDB table for revealed hex state

## Commands

From repo root:

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:ecr:push
```

From this directory:

```bash
pnpm infra:up
pnpm infra:down
pnpm ecr:push
```

## `infra:up` Behavior

`infra/scripts/infra-up.sh` does the following:

1. Verifies/creates the Lambda IAM role (`ROLE_NAME`) and required policies.
2. Optionally deploys `ChultCloudFrontCertStack` in `us-east-1` when custom-domain env vars are present.
3. Builds/pushes the image tag to ECR.
4. Ensures service S3 bucket exists (uses `SERVICE_BUCKET_NAME` or default `chult-map-service-<account>-<region>`).
5. Ensures DynamoDB table exists (`HEXES_TABLE_NAME`).
6. Deploys `ChultServiceStack`.
7. Syncs `client/public` into S3 and invalidates CloudFront.

## `infra:down` Behavior

`infra/scripts/infra-down.sh` does the following:

1. Destroys `ChultServiceStack`.
2. Destroys `ChultCloudFrontCertStack`.
3. Preserves DynamoDB table by default; deletes it only with `--delete-db-table` (exports first).
4. Preserves service bucket by default; deletes it only with `--delete-service-bucket`.
5. Deletes service bucket only when tagged `ManagedBy=chult-infra-up`.

## Environment Variables

Shared defaults are loaded from `infra/scripts/env.sh` and optional `infra/.env`.

`infra:up`:

- `AWS_REGION` (default `us-west-2`)
- `REPO_NAME` (default `chult-map-service`)
- `IMAGE_TAG` (default UTC timestamp)
- `TIMESTAMP_TAG` (used when `IMAGE_TAG` unset)
- `ROLE_NAME` (default `ChultLambdaExecutionRole`)
- `SERVICE_BUCKET_NAME` (optional; validated)
- `HEXES_TABLE_NAME` (default `chult-map-hexes`)
- `HOSTED_ZONE_ID` + `HOSTED_ZONE_NAME` + `SUBDOMAIN` (all 3 required together for custom domain)

`ecr:push`:

- `AWS_REGION`
- `REPO_NAME`
- `IMAGE_TAG` (default `latest`)
