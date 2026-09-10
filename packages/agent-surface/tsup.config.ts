import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: false,
  treeshake: true,
  splitting: false,
  platform: "node",
  target: "node20",
  external: ["zod"],
});
