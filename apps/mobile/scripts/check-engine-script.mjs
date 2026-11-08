/**
 * The engine page is parsed by WKWebView as a classic script. `node --check` on a
 * .cjs file uses that grammar, so import.meta / import() / a broken </script> fail the build.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/engine/index.html");
const html = readFileSync(htmlPath, "utf8");
if (/<script type="module"/.test(html)) {
  console.error("engine HTML still contains a module script");
  process.exit(1);
}
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
if (!blocks.some((block) => block.length > 100_000)) {
  console.error("engine HTML is missing the inlined classic script");
  process.exit(1);
}
for (const [index, js] of blocks.entries()) {
  if (/\bimport\.meta\b/.test(js)) {
    console.error(`script ${index} still contains import.meta`);
    process.exit(1);
  }
  if (/<\/script/i.test(js)) {
    console.error(`script ${index} contains a closing script tag`);
    process.exit(1);
  }
  const tmp = path.join("/tmp", `imello-engine-check-${index}.cjs`);
  writeFileSync(tmp, js);
  const checked = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  unlinkSync(tmp);
  if (checked.status !== 0) {
    console.error(checked.stderr || checked.stdout);
    process.exit(checked.status || 1);
  }
}
const bytes = blocks.reduce((sum, block) => sum + block.length, 0);
console.log(`engine scripts parse as classic scripts (${blocks.length} blocks, ${bytes} bytes)`);
