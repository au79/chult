# Interactive Chult Map Server

Chult is the location for the Tomb of Annihilation module for D&D 5e.

This application serves a hex map of Chult with undiscovered hexes obscured, on both DM- and player-facing pages.
The DM page allows the hexes to be clicked to toggle the revealed state for each.  The player page gets those
changes pushed immediately via Web Socket.

## Features

- **Realtime map state** powered by `ws` and Hono endpoints (Node 22+).
- **Modular monorepo** with a shared workspace powering both the API (`server/`) and browser assets (`client/`).
- **Single Docker image** that bundles the compiled server plus the published client assets.

## Tech Stack

- Node.js 22 + pnpm 9 (monorepo with workspaces)
- Hono + @hono/node-server for HTTP/websocket routing
- TypeScript (server) with Vitest for tests
- Static client assets served from `client/public`

## Getting Started

### Prerequisites

- Node.js ≥ 22
- pnpm ≥ 9 (`corepack enable pnpm` recommended)

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
# Build the image
docker build -t chult-map-server .

# Run the app
docker run --rm -p 9876:9876 -v "$(pwd)/server/data:/app/server/data" chult-map-server
```

- Exposes port `9876`
- Data volume: `/app/server/data` (bind to persist world state)

## Project Structure

```
.
├── client/      # Client package (static assets + formatting/tests)
├── server/      # Hono service source, TypeScript build, tests
├── shared/      # Shared types
└── Dockerfile   # Multi-stage build (pnpm install/build/prune)

```

## Contributing

Issues and pull requests are welcome! Please run `pnpm format` and `pnpm -r test` before submitting changes, and include
any relevant updates to documentation.

That said, I'm unlikely to touch this once it's sufficient to my needs. So you may want to simply fork the repo and have
at it.
