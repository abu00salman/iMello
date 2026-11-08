/**
 * In-process stand-in for @matrix-org/matrix-sdk-crypto-wasm.
 * The published entry fetches a .wasm URL. The engine page is an HTML string with no
 * file server, so the bytes are compiled into the bundle and instantiated here.
 * matrix-js-sdk calls initAsync() with no arguments; a second call is a no-op.
 */
import * as bindings from "@crypto-bg";
import wasmB64 from "virtual:imello-wasm";

let pending = null;

function decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function initAsync() {
  if (!pending) {
    pending = (async () => {
      const bytes = decode(wasmB64);
      const { instance } = await WebAssembly.instantiate(bytes, {
        "./matrix_sdk_crypto_wasm_bg.js": bindings,
      });
      bindings.__wbg_set_wasm(instance.exports);
      if (typeof instance.exports.__wbindgen_start === "function") instance.exports.__wbindgen_start();
    })();
  }
  await pending;
}

export * from "@crypto-bg";
