import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { build } from "tsup";

await build({
  entry: ["src/index.ts"], format: ["esm", "cjs"], dts: false, clean: true,
  sourcemap: false, treeshake: true, splitting: false, platform: "node", target: "node20", external: ["zod"],
});
await cp("public.d.ts", "dist/index.d.ts");
