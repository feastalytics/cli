import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  bundle: true,
  clean: true,
  minify: false,
});
