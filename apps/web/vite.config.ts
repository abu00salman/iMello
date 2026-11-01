import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Content-Security-Policy for the web client. The same policy is emitted as
 * real HTTP headers in production (see public/_headers, generated at build).
 *  - no inline or third-party scripts; 'wasm-unsafe-eval' is required for the
 *    Rust crypto WebAssembly module;
 *  - connections only to this origin, the iMello API and the homeserver;
 *  - the app can never be framed (clickjacking).
 */
export function contentSecurityPolicy(connect: string[], dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'`,
    // Vite injects <style> tags during development only.
    `style-src 'self'${dev ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${connect.join(" ")}${dev ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join("; ");
}

export const securityHeaders = (csp: string): Record<string, string> => ({
  "Content-Security-Policy": csp,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const connect = [env.VITE_API_URL ?? "http://localhost:8787", env.VITE_HOMESERVER_URL ?? "http://localhost:8008"];
  const metaCsp = env.VITE_CSP_META === "true";
  return {
    // Sub-path hosting (e.g. GitHub Pages project sites: VITE_BASE=/iMello/).
    base: env.VITE_BASE ?? "/",
    plugins: [
      react(),
      {
        // Static hosts that cannot send HTTP headers (GitHub Pages) get the CSP as a <meta> tag.
        // frame-ancestors is not supported in <meta>, so clickjacking protection is weaker there.
        name: "imello-meta-csp",
        apply: "build",
        transformIndexHtml(html) {
          if (!metaCsp) return html;
          const csp = contentSecurityPolicy(connect).replace(/; frame-ancestors 'none'/, "");
          return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
        },
      },
      {
        // Emit Cloudflare Pages / Netlify-style _headers so production gets real CSP headers.
        name: "imello-security-headers",
        apply: "build",
        generateBundle() {
          const headers = securityHeaders(contentSecurityPolicy(connect));
          const body = ["/*", ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`),
            "  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload", "",
            "/assets/*", "  Cache-Control: public, max-age=31536000, immutable", ""].join("\n");
          this.emitFile({ type: "asset", fileName: "_headers", source: body });
        },
      },
    ],
    optimizeDeps: { exclude: ["@matrix-org/matrix-sdk-crypto-wasm"] },
    build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 6000 },
    server: { port: 5173, strictPort: true, headers: securityHeaders(contentSecurityPolicy(connect, true)) },
    preview: { port: 4173, strictPort: true, headers: securityHeaders(contentSecurityPolicy(connect)) },
  };
});
