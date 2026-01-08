import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import type { RevealedHexes } from '#shared/hexes';
import { HexWebSocketHub } from '../ws.js';

class MockStore extends EventEmitter {
  hexes: number[] = [];
  applyHexIdChange = vi.fn(async (value: number) => {
    const target = Math.abs(value);
    if (value < 0 && !this.hexes.includes(target)) {
      this.hexes.push(target);
    } else if (value > 0) {
      this.hexes = this.hexes.filter((hex) => hex !== target);
    }
    const nextState: RevealedHexes = { hexes: [...this.hexes] };
    this.emit('change', nextState);
    return nextState.hexes;
  });

  constructor(initial: number[] = []) {
    super();
    this.hexes = initial;
  }

  getAll() {
    return [...this.hexes];
  }
}

class MockWebSocket extends EventEmitter {
  sent: string[] = [];
  readyState = 1;
  OPEN = 1;

  send(payload: string) {
    this.sent.push(payload);
  }
}

class MockWebSocketServer {
  #handler: ((socket: MockWebSocket) => void) | null = null;

  on(event: 'connection', handler: (socket: MockWebSocket) => void) {
    if (event === 'connection') {
      this.#handler = handler;
    }
  }

  connect(socket: MockWebSocket) {
    this.#handler?.(socket);
  }
}

describe('HexWebSocketHub', () => {
  it('sends the current snapshot on connect and broadcasts changes', () => {
    const store = new MockStore([1, 2]);
    const mockServer = new MockWebSocketServer();

    const hub = new HexWebSocketHub(store as any, {
      createServer: () => mockServer as any,
    });

    hub.attach({} as HttpServer);

    const socketA = new MockWebSocket();
    mockServer.connect(socketA);

    expect(socketA.sent.at(-1)).toBe(JSON.stringify({ hexes: [1, 2] }));

    const socketB = new MockWebSocket();
    mockServer.connect(socketB);

    const nextState: RevealedHexes = { hexes: [3] };
    store.emit('change', nextState);

    expect(socketA.sent.at(-1)).toBe(JSON.stringify(nextState));
    expect(socketB.sent.at(-1)).toBe(JSON.stringify(nextState));
  });

  it('removes clients when they close or error', () => {
    const store = new MockStore([]);
    const mockServer = new MockWebSocketServer();
    const hub = new HexWebSocketHub(store as any, {
      createServer: () => mockServer as any,
    });

    hub.attach({} as HttpServer);
    const socket = new MockWebSocket();
    mockServer.connect(socket);

    socket.emit('close');
    store.emit('change', { hexes: [4] });

    // If the cleanup failed, the closed socket would have received another send.
    expect(socket.sent).toHaveLength(1);
  });

  it('applies incoming instructions received over the socket', async () => {
    const store = new MockStore([]);
    const mockServer = new MockWebSocketServer();
    const hub = new HexWebSocketHub(store as any, {
      createServer: () => mockServer as any,
    });

    hub.attach({} as HttpServer);
    const socket = new MockWebSocket();
    mockServer.connect(socket);

    socket.emit('message', JSON.stringify({ value: -3 }));
    await flushMicrotasks();

    expect(store.applyHexIdChange).toHaveBeenCalledWith(-3);
  });
});

function flushMicrotasks() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
