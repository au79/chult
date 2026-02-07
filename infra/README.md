# AWS Resources for chult.oolong.com

This document lists the AWS resources needed to securely host the Docker-based service behind an ALB and expose it as `chult.oolong.com`. CDK code lives in this directory under `bin/` and `lib/`.

## Core service path

1. **Container image registry (ECR)**
   - Private ECR repository to store the built Docker image.
   - Lifecycle policy to expire old images.

2. **Lambda function (container image)**
   - Lambda function created from the ECR image.
   - Memory/timeout configured for the service.
   - Environment variables for runtime configuration (if any).
   - **Execution role** with least-privilege permissions (ECR pull).

3. **Application Load Balancer (ALB)**
   - ALB in public subnets of a VPC.
   - **Security group** allowing inbound 443 (and optionally 80 for redirect), outbound as needed.
   - **Listener on 443** with an ACM certificate.
   - **Optional listener on 80** that redirects to 443.
   - **Lambda target group** (type: Lambda) with the Lambda function as a target.
   - **Lambda permission** allowing the ALB target group to invoke the Lambda.

4. **TLS/SSL certificate (ACM)**
   - ACM certificate for `chult.oolong.com`.
   - DNS validation via Route 53.
   - Certificate must be in the same region as the ALB.

5. **DNS (Route 53)**
   - Hosted zone for `oolong.com` (already owned).
   - **A/AAAA alias record** for `chult.oolong.com` pointing to the ALB.
   - Validation records for ACM (created automatically or manually).

## Security and hardening
- **HTTPS-only**: enforce 443; redirect 80 to 443.
- **Least privilege IAM** for Lambda execution and deployment roles.
- **WAF (AWS WAFv2)** attached to the ALB for basic protections (optional but recommended).

## Networking considerations

- **Dedicated VPC + public subnets** for the ALB.
- **Internet Gateway** and route tables for public subnets.
- Lambda itself does not need VPC access for ALB integration unless it must reach VPC-only resources.

## Deployment pipeline (minimum viable)

- Build and push Docker image to ECR.
- Update Lambda to the new image digest.
- ALB forwards to Lambda target group.
- Route 53 alias record resolves `chult.oolong.com` to the ALB.

## CDK usage

The CDK app uses CloudFormation parameters for account-specific details:

- `HostedZoneId` (required)
- `HostedZoneName` (default: `oolong.com`)
- `DomainName` (default: `chult.oolong.com`)
- `ImageTag` (default: `latest`)
- `EcrRepositoryName` (default: `chult-map-service`)
- `LambdaRoleName` (default: `ChultLambdaExecutionRole`)

Example deploy:

```bash
pnpm --dir infra install
pnpm --dir infra cdk bootstrap
pnpm --dir infra cdk deploy ChultServiceStack \\
  --parameters HostedZoneId=Z1234567890 \\
  --parameters HostedZoneName=oolong.com \\
  --parameters DomainName=chult.oolong.com \\
  --parameters ImageTag=latest
```

## ACM validation note

The certificate uses DNS validation via Route 53. CDK will create the validation records in the hosted zone and wait for validation to complete before finishing the deploy.

## Manual IAM role setup

Create the Lambda execution role outside this stack, then pass its name via `LambdaRoleName` (or rely on the default).

Artifacts:

- Trust policy: `infra/iam/lambda-trust-policy.json`
- Script: `infra/scripts/create-lambda-role.sh`

Run from repo root:

```bash
pnpm --dir infra create-lambda-role
```

Prerequisite:

- `jq` must be installed and available in `PATH`.

Optional environment variables:

- `ROLE_NAME` (default: `ChultLambdaExecutionRole`)
- `BOUNDARY_ARN` (if your account requires a permissions boundary)

## Package scripts

From repo root:

- `pnpm --dir infra build` compiles the CDK app.
- `pnpm --dir infra watch` runs TypeScript in watch mode.
- `pnpm --dir infra synth` synthesizes the CloudFormation template.
- `pnpm --dir infra deploy` deploys the stack.
- `pnpm --dir infra destroy` tears down the stack.
- `pnpm --dir infra cdk` runs any raw CDK command.
