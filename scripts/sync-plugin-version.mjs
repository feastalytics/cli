import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

for (const path of ["plugin/.claude-plugin/plugin.json", "plugin/plugin.json"]) {
  const file = new URL(path, root);
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  manifest.version = version;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
