import WebSocket from 'ws';

/**
 * Minimal Socket.IO v4 client for e2e tests (Engine.IO 4 over a plain
 * WebSocket, default namespace): connect with `auth`, emit with an ack,
 * collect server events. Avoids adding `socket.io-client` only for tests.
 */
export interface TestSocket {
  /** Emits `event` and resolves with the server's ack payload. */
  emitWithAck<T = unknown>(event: string, data: unknown, timeoutMs?: number): Promise<T>;
  /** Server events received so far, in order. */
  readonly received: { event: string; data: unknown }[];
  /** Resolves with the first `event` (already received or next) matching `match`. */
  waitFor<T = unknown>(event: string, match?: (data: T) => boolean, timeoutMs?: number): Promise<T>;
  /** True once the server closed the Socket.IO session (e.g. auth refused). */
  readonly closed: boolean;
  close(): void;
}

export const connectSocket = (baseUrl: string, token: string | null, settleMs = 150): Promise<TestSocket> =>
  new Promise((resolve, reject) => {
    const url = `${baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
    const ws = new WebSocket(url);
    const received: { event: string; data: unknown }[] = [];
    const acks = new Map<number, (data: unknown) => void>();
    const waiters: { event: string; match: (d: unknown) => boolean; done: (d: unknown) => void }[] = [];
    let nextAck = 1;
    let closed = false;
    let opened = false;

    const api: TestSocket = {
      received,
      get closed() {
        return closed;
      },
      emitWithAck<T>(event: string, data: unknown, timeoutMs = 5000): Promise<T> {
        const id = nextAck++;
        return new Promise<T>((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`no ack for ${event}`)), timeoutMs);
          acks.set(id, (d) => {
            clearTimeout(timer);
            res(d as T);
          });
          ws.send(`42${id}${JSON.stringify([event, data])}`);
        });
      },
      waitFor<T>(event: string, match: (data: T) => boolean = () => true, timeoutMs = 5000): Promise<T> {
        const hit = received.find((r) => r.event === event && match(r.data as T));
        if (hit) {
          return Promise.resolve(hit.data as T);
        }
        return new Promise<T>((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`no ${event} within ${timeoutMs} ms`)), timeoutMs);
          waiters.push({
            event,
            match: match as (d: unknown) => boolean,
            done: (d) => {
              clearTimeout(timer);
              res(d as T);
            },
          });
        });
      },
      close() {
        closed = true;
        ws.close();
      },
    };

    ws.on('message', (raw: WebSocket.RawData) => {
      const msg = raw.toString();
      if (msg.startsWith('0')) {
        ws.send(`40${JSON.stringify(token ? { token } : {})}`);
      } else if (msg === '2') {
        ws.send('3');
      } else if (msg.startsWith('40')) {
        opened = true;
        // Let the gateway finish handleConnection (auth, rooms) first.
        setTimeout(() => resolve(api), settleMs);
      } else if (msg.startsWith('41') || msg.startsWith('44')) {
        closed = true;
        if (!opened) {
          resolve(api);
        }
      } else if (msg.startsWith('43')) {
        const m = /^43(\d+)(.*)$/s.exec(msg);
        if (m) {
          const [data] = JSON.parse(m[2]) as unknown[];
          acks.get(Number(m[1]))?.(data);
          acks.delete(Number(m[1]));
        }
      } else if (msg.startsWith('42')) {
        const [event, data] = JSON.parse(msg.replace(/^42\d*/, '')) as [string, unknown];
        received.push({ event, data });
        for (const w of [...waiters]) {
          if (w.event === event && w.match(data)) {
            waiters.splice(waiters.indexOf(w), 1);
            w.done(data);
          }
        }
      }
    });
    ws.on('close', () => {
      closed = true;
    });
    ws.on('error', reject);
  });
