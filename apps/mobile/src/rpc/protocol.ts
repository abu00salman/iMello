/**
 * Typed messages between the native UI and the invisible crypto engine.
 * This module is pure (no React Native, no DOM) so both sides and the unit tests share it.
 * Message bodies are carried as data; nothing here logs them.
 */

export const RPC_VERSION = 1 as const;

export type Receipt = "pending" | "delivered" | "read" | "failed";

export interface RpcErrorBody {
  code: string;
  message: string;
}

export interface RpcRequest {
  v: typeof RPC_VERSION;
  kind: "req";
  id: string;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  v: typeof RPC_VERSION;
  kind: "res";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: RpcErrorBody;
}

export interface RpcEvent {
  v: typeof RPC_VERSION;
  kind: "evt";
  event: string;
  data?: unknown;
}

export type RpcMessage = RpcRequest | RpcResponse | RpcEvent;

export class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export function requestMessage(id: string, method: string, params?: unknown): RpcRequest {
  return { v: RPC_VERSION, kind: "req", id, method, params };
}

export function responseMessage(id: string, result: unknown): RpcResponse {
  return { v: RPC_VERSION, kind: "res", id, ok: true, result };
}

export function errorMessage(id: string, code: string, message: string): RpcResponse {
  return { v: RPC_VERSION, kind: "res", id, ok: false, error: { code, message } };
}

export function eventMessage(event: string, data?: unknown): RpcEvent {
  return { v: RPC_VERSION, kind: "evt", event, data };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse one bridge payload. Returns null when the payload is not our protocol. */
export function parseRpcMessage(raw: string): RpcMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== RPC_VERSION) return null;
  if (value.kind === "req" && typeof value.id === "string" && typeof value.method === "string") {
    return { v: RPC_VERSION, kind: "req", id: value.id, method: value.method, params: value.params };
  }
  if (value.kind === "res" && typeof value.id === "string" && typeof value.ok === "boolean") {
    const error = isRecord(value.error) && typeof value.error.code === "string"
      ? { code: value.error.code, message: typeof value.error.message === "string" ? value.error.message : value.error.code }
      : undefined;
    return { v: RPC_VERSION, kind: "res", id: value.id, ok: value.ok, result: value.result, error };
  }
  if (value.kind === "evt" && typeof value.event === "string") {
    return { v: RPC_VERSION, kind: "evt", event: value.event, data: value.data };
  }
  return null;
}

/** Public error text only: never forward SDK messages that might echo request data. */
export function safeError(err: unknown): RpcErrorBody {
  if (err instanceof RpcError) return { code: err.code, message: err.message };
  if (err instanceof Error && /^[a-z0-9_]{1,80}$/i.test(err.message)) return { code: err.message, message: err.message };
  const http = (err as { httpStatus?: number; status?: number }).httpStatus ?? (err as { status?: number }).status;
  const code = (err as { errcode?: string; code?: string; name?: string }).errcode
    ?? (err as { code?: string }).code
    ?? (err as { name?: string }).name
    ?? "error";
  const safe = String(code).slice(0, 80);
  return { code: safe, message: typeof http === "number" ? `http_${http}` : safe };
}
