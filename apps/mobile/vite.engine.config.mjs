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
    rollupOptions: {
      input: path.join(root, "engine/index.html"),
      output: { codeSplitting: false },
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
      name: "imello-single-html",
      apply: "build",
      closeBundle() {
        const htmlPath = path.join(outDir, "index.html");
        let html = readFileSync(htmlPath, "utf8");
        const match = html.match(/<script type="module"[^>]*src="([^"]+)"><\/script>/);
        if (!match?.[1]) throw new Error("engine bundle script tag missing");
        const jsPath = path.join(outDir, match[1].replace(/^\//, ""));
        const js = readFileSync(jsPath, "utf8");
        html = html.replace(match[0], `<script type="module">\n${js}\n</script>`);
        writeFileSync(htmlPath, html);
        unlinkSync(jsPath);
        rmSync(path.join(outDir, "assets"), { recursive: true, force: true });
      },
    },
  ],
});
