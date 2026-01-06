import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { RevealedHexes } from '#shared/hexes';
import { HexStore } from './hexStore.js';

type WebSocketServerLike = {
  on(event: 'connection', listener: (socket: WebSocket) => void): void;
};

type WebSocketHubOptions = {
  createServer?: (server: HttpServer) => WebSocketServerLike;
};

/**
 * Simple WebSocket hub that pushes revealed-hex snapshots to connected clients.
 */
export class HexWebSocketHub {
  #clients = new Set<WebSocket>();
  #wss: WebSocketServerLike | null = null;
  #createServer: (server: HttpServer) => WebSocketServerLike;

  constructor(
    private readonly store: HexStore,
    options: WebSocketHubOptions = {},
  ) {
    this.#createServer =
      options.createServer ??
      ((server) => new WebSocketServer({ server, path: '/ws' }));

    this.store.on('change', (payload: RevealedHexes) =>
      this.broadcast(payload),
    );
  }

  /**
   * Attaches the hub to an HTTP server and begins accepting `/ws` connections.
   */
  attach(server: HttpServer) {
    if (this.#wss) {
      return;
    }

    this.#wss = this.#createServer(server);
    this.#wss.on('connection', (socket) => this.#handleConnection(socket));
  }

  #handleConnection(socket: WebSocket) {
    this.#clients.add(socket);

    const cleanup = () => {
      this.#clients.delete(socket);
    };

    socket.on('close', cleanup);
    socket.on('error', cleanup);
    socket.on('message', () => {
      // Ignore incoming messages for now; future versions may add commands.
    });

    socket.send(JSON.stringify({ hexes: this.store.getAll() }));
  }

  /**
   * Broadcasts the latest snapshot to every connected client.
   */
  broadcast(payload: RevealedHexes) {
    const serialized = JSON.stringify(payload);
    for (const client of this.#clients) {
      if (client.readyState === client.OPEN) {
        client.send(serialized);
      }
    }
  }
}
