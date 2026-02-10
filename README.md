# Interactive Chult Map Server

Chult is the location for the Tomb of Annihilation module for D&D 5e.

This application serves a hex map of Chult with undiscovered hexes obscured, on both DM- and player-facing pages.
The DM page allows the hexes to be clicked to toggle the revealed state for each. The player page stays in sync by
polling the service.

## Features

- **Realtime-ish map state** powered by polling and Hono endpoints (Node 22+).
- **Modular monorepo** with a shared workspace powering both the API (`server/`) and browser assets (`client/`).
- **Lambda-compatible Docker image** for the API (Function URL).
- **Static hosting** via S3 + CloudFront for large assets.
- **Infrastructure as code** with an AWS CDK app under `infra/`.

## Tech Stack

- Node.js 22 + pnpm 9 (monorepo with workspaces)
- Hono + AWS Lambda adapter (Function URL)
- TypeScript (server) with Vitest for tests
- Static client assets served from `client/public`

## Getting Started

### Prerequisites

- Node.js ≥ 18.20.4
- pnpm ≥ 9.5.0 (`corepack enable pnpm` recommended)

### Install Dependencies

```bash
pnpm install
```

### Local Development

```bash
# Run the server in watch mode
pnpm server:dev

# Build the production bundle
pnpm server:build

# Run the entire workspace test suite
pnpm -r test
```

### Formatting

```bash
pnpm format
```

## Docker

```bash
# Build the Lambda image
docker build -t chult-map-server .

# Run the app locally
docker run --rm -d -p 9876:9876 -v "$(pwd)/server/data:/var/task/server/data" chult-map-server
```

- Exposes port `9876` (local)
- Data volume: `/var/task/server/data` (bind to persist world state)

## AWS / Infra

The AWS CDK app lives in `infra/`. The production deployment uses:

- Lambda Function URL → Hono AWS adapter (API)
- S3 + CloudFront for static assets
- Route 53 record for `chult.oolong.com` → CloudFront
- ACM certificate (CloudFront in us-east-1)
- ECR repo `chult-map-service` (timestamp tags)

Useful commands:

```bash
pnpm --dir infra infra:up
pnpm --dir infra infra:down
pnpm --dir infra cdk deploy ChultServiceStack \
  --parameters HostedZoneId=Z1234567890 \
  --parameters HostedZoneName=oolong.com \
  --parameters Subdomain=chult \
  --parameters ImageTag=20260209173000 \
  --parameters StaticBucketName=oolong-chult-map-service-static \
  --parameters CloudFrontCertArn=arn:aws:acm:us-east-1:123456789012:certificate/abc...
```

## Project Structure

```
.
├── client/      # Client package (static assets + formatting/tests)
├── server/      # Hono service source, TypeScript build, tests
├── shared/      # Shared types
├── infra/       # AWS CDK app + scripts
└── Dockerfile   # Multi-stage build (pnpm install/build/prune)

```

## Contributing

Issues and pull requests are welcome! Please run `pnpm format` and `pnpm -r test` before submitting changes, and include
any relevant updates to documentation.

That said, I'm unlikely to touch this once it's sufficient to my needs. So you may want to simply fork the repo and have
at it.
