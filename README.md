# Interactive Chult Map Server

Hex-reveal map service for Tomb of Annihilation. The DM view toggles revealed hexes and the player view polls the API.

## Requirements

- Node.js `>=22.21.0`
- pnpm `>=9.5.0`

## Local Dev

```bash
# Install workspace dependencies
pnpm install
# Start the server in watch mode
pnpm server:dev
```

Useful commands:

```bash
# Build the server package
pnpm server:build
# Run server tests
pnpm server:test
# Run all workspace tests
pnpm -r test
# Format client, infra, and server files
pnpm format
```

## Docker

```bash
# Build the Lambda container image
pnpm run docker:build
# Run the container locally on port 9876 with persisted data volume
pnpm run docker:run
```

The app listens on `9876`. Mount `/var/task/server/data` to persist local file storage.

## Deploying to AWS

Infrastructure for deploying to AWS lives in [`infra/`](infra/README.md).
See the infra README prerequisites section for required CLIs (`aws`, `docker`/`buildx`, `jq`) and AWS permissions.

```bash
# Deploy infra stack and sync static assets
pnpm infra:up
# Tear down deployed infra stacks
pnpm infra:down
# Build and push the service image to ECR
pnpm infra:ecr:push
```

- `infra:up` deploys ECR image + service stack, builds client assets, and syncs `client/dist` to S3.
- Custom domain is enabled only when `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME`, and `SUBDOMAIN` are all set.
- Hex state storage resolves to DynamoDB in Lambda, otherwise local file storage unless `HEX_ID_STORAGE` overrides it.

## Monorepo Layout

```text
client/   React client build + static asset output (`index.html`, `dm.html`)
server/   Hono API + Lambda handler
infra/    CDK app + deploy scripts
```
