/** Startup watchdog. Each stage has its own clock so a stuck step cannot hide behind an earlier success. */

export const STAGE_TIMEOUT_MS = 20_000;

export const BOOT_STAGES = ["asset", "webview", "hello", "session"] as const;
export type BootStage = (typeof BOOT_STAGES)[number];

export function stageExpired(startedAt: number, now: number, timeoutMs = STAGE_TIMEOUT_MS): boolean {
  return now - startedAt >= timeoutMs;
}

export interface DiagnosticInput {
  stage: string;
  message: string;
  logs: readonly string[];
  assetUri?: string;
  assetBytes?: number;
}

/** Plain text for the copy button. No message bodies: startup has none. */
export function formatDiagnostics(input: DiagnosticInput): string {
  const lines = [
    "iMello engine diagnostics",
    `stage: ${input.stage}`,
    `error: ${input.message}`,
    input.assetUri ? `asset: ${input.assetUri}` : "",
    typeof input.assetBytes === "number" ? `assetBytes: ${input.assetBytes}` : "",
    "logs:",
    ...(input.logs.length ? input.logs : ["(none)"]),
  ];
  return lines.filter((line) => line !== "").join("\n");
}

/** Directory URL WKWebView may read while loading the engine file. */
export function readAccessDirectory(fileUri: string): string {
  const cut = fileUri.lastIndexOf("/");
  if (cut <= "file://".length) return fileUri;
  return fileUri.slice(0, cut + 1);
}
