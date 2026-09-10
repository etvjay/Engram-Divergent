import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const packageDir = resolve("packages/agent-surface");

describe("packed Engram SDK boundary", () => {
  it("installs and imports only the packed public entrypoint in a cold consumer", async () => {
    const temp = await mkdtemp("/tmp/engram-sdk-consumer-");
    try {
      await exec("npm", ["pack", "--pack-destination", temp], { cwd: packageDir });
      const tarball = join(temp, "engram-agent-surface-1.0.2.tgz");
      const consumer = join(temp, "consumer");
      await exec("mkdir", ["-p", consumer]);
      await exec("npm", ["init", "-y"], { cwd: temp });
      await exec("npm", ["install", "--ignore-scripts", tarball], { cwd: temp });
      const { stdout } = await exec("node", ["--input-type=module", "-e", `
        import { EngramClient, EngramError, EngramRefusalError, createEngramClient } from "engram-agent-surface";
        if (![EngramClient, EngramError, EngramRefusalError, createEngramClient].every((value) => typeof value === "function")) process.exit(1);
        console.log("public import ok");
      `], { cwd: consumer });
      expect(stdout).toContain("public import ok");
      const { stdout: listing } = await exec("tar", ["-tzf", tarball]);
      expect(listing).not.toMatch(/packages\/(sibyl|memory-core|experience)|\.env|secret|credential/i);
      const packageJson = JSON.parse(await readFile(join(temp, "node_modules/engram-agent-surface/package.json"), "utf8"));
      expect(packageJson.exports["."]).toEqual({ types: "./dist/index.d.ts", import: "./dist/index.js", require: "./dist/index.cjs" });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);
});
