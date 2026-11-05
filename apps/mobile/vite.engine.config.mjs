import { createRequire } from "node:module";
import { readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.dirname(require.resolve("@matrix-org/matrix-sdk-crypto-wasm"));
const wasmFile = path.join(pkgDir, "pkg/matrix_sdk_crypto_wasm_bg.wasm");
const bgFile = path.join(pkgDir, "pkg/matrix_sdk_crypto_wasm_bg.js");
const outDir = path.resolve(root, "assets/engine");

export default defineConfig({
  root: path.join(root, "engine"),
  resolve: {
    alias: {
      "@matrix-org/matrix-sdk-crypto-wasm": path.join(root, "engine/src/crypto-shim.mjs"),
      "@crypto-bg": bgFile,
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rollupOptions: {
      input: path.join(root, "engine/index.html"),
      output: {
        format: "iife",
        inlineDynamicImports: true,
        name: "ImelloEngine",
      },
    },
  },
  plugins: [
    {
      name: "imello-wasm-bytes",
      resolveId(id) {
        if (id === "virtual:imello-wasm") return "\0virtual:imello-wasm";
        return null;
      },
      load(id) {
        if (id !== "\0virtual:imello-wasm") return null;
        const b64 = readFileSync(wasmFile).toString("base64");
        return `export default ${JSON.stringify(b64)};`;
      },
    },
    {
      name: "imello-classic-script",
      renderChunk(code) {
        // WKWebView runs this file as a classic script. import.meta is a syntax error there.
        return code.replace(/\bimport\.meta\b/g, "({url:\"\"})");
      },
    },
    {
      name: "imello-single-html",
      apply: "build",
      closeBundle() {
        const htmlPath = path.join(outDir, "index.html");
        let html = readFileSync(htmlPath, "utf8");
        const match = html.match(/<script(?: type="module")?[^>]*src="([^"]+)"><\/script>/);
        if (!match?.[1]) throw new Error("engine bundle script tag missing");
        const jsPath = path.join(outDir, match[1].replace(/^\//, ""));
        // String.replace treats $& $' $` in the replacement as patterns. The SDK
        // contains "\\$&", which was rewritten into a literal <script> tag.
        let js = readFileSync(jsPath, "utf8");
        js = js.replace(/<\/script/gi, "<\\/script");
        const prelude = "globalThis.global=globalThis;globalThis.process=globalThis.process||{env:{}};\n";
        const inline = `<script>\n${prelude}${js}\n</script>`;
        const at = html.indexOf(match[0]);
        if (at < 0) throw new Error("engine script tag not found");
        html = html.slice(0, at) + inline + html.slice(at + match[0].length);
        writeFileSync(htmlPath, html);
        unlinkSync(jsPath);
        rmSync(path.join(outDir, "assets"), { recursive: true, force: true });
      },
    },
  ],
});
