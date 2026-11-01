import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

/**
 * A pass-through HTTP proxy that can be switched "offline" to simulate a lost
 * network connection: open connections (including long-poll /sync) are cut and
 * new requests fail until it is switched back online.
 */
export async function createFlakyProxy(target: string) {
  const targetUrl = new URL(target);
  let online = true;
  const sockets = new Set<Socket>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!online) {
      req.socket.destroy();
      return;
    }
    const upstream = request(
      { host: targetUrl.hostname, port: targetUrl.port, method: req.method, path: req.url, headers: { ...req.headers, host: targetUrl.host } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    setOnline(value: boolean) {
      online = value;
      if (!value) for (const s of sockets) s.destroy();
    },
    close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}
