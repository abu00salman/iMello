import { eventMessage, parseRpcMessage, requestMessage, RpcError, type RpcEvent, type RpcResponse } from "./protocol";

export interface RpcTransport {
  send(json: string): void;
  subscribe(listener: (json: string) => void): () => void;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: RpcError) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Correlates request ids with responses and fans events out to listeners.
 * The transport is injected so tests can run without a WebView.
 */
export class RpcClient {
  private seq = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly transport: RpcTransport,
    private readonly timeoutMs = 20_000,
  ) {
    this.unsubscribe = transport.subscribe((raw) => this.onRaw(raw));
  }

  call<T>(method: string, params?: unknown): Promise<T> {
    const id = `m${++this.seq}`;
    const body = requestMessage(id, method, params);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError("timeout", method));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.transport.send(JSON.stringify(body));
    });
  }

  on(event: string, listener: (data: unknown) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Inject an event as if the engine had emitted it. Used by the host for local signals. */
  emit(event: string, data?: unknown): void {
    this.dispatch(eventMessage(event, data));
  }

  dispose(): void {
    this.unsubscribe();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new RpcError("closed", "closed"));
    }
    this.pending.clear();
  }

  private onRaw(raw: string): void {
    const msg = parseRpcMessage(raw);
    if (msg) this.dispatch(msg);
  }

  private dispatch(msg: RpcResponse | RpcEvent | ReturnType<typeof requestMessage>): void {
    if (msg.kind === "res") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.ok) pending.resolve(msg.result);
      else pending.reject(new RpcError(msg.error?.code ?? "error", msg.error?.message ?? "error"));
      return;
    }
    if (msg.kind === "evt") {
      const set = this.listeners.get(msg.event);
      if (!set) return;
      for (const listener of set) listener(msg.data);
    }
  }
}
