import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const experimentsDir = join(root, "experiments");

function experimentId(name: string): string | null {
  return /^EXP-(\d{3})-/.exec(name)?.[1] ?? null;
}

describe("Engram evidence registry integrity", () => {
  it("keeps exactly one experiment directory per EXP id and matches the canonical registry", async () => {
    const entries = await readdir(experimentsDir, { withFileTypes: true });
    const experimentDirs = entries
      .filter((entry) => entry.isDirectory() && /^EXP-\d{3}-/.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    const ids = experimentDirs.map((name) => experimentId(name));
    expect(new Set(ids).size).toBe(ids.length);

    const registry = await readFile(join(experimentsDir, "README.md"), "utf8");
    for (const directory of experimentDirs) {
      expect(registry, `registry must include ${directory}`).toContain(`\`${directory}\``);
    }

    const registeredDirs = [...registry.matchAll(/`(EXP-\d{3}-[^`]+)`/g)].map((match) => match[1]!);
    expect([...registeredDirs].sort()).toEqual(experimentDirs);
  });

  it("requires every canonical experiment to carry the full evidence record", async () => {
    const entries = await readdir(experimentsDir, { withFileTypes: true });
    const experimentDirs = entries
      .filter((entry) => entry.isDirectory() && /^EXP-\d{3}-/.test(entry.name))
      .map((entry) => entry.name);

    for (const directory of experimentDirs) {
      for (const filename of ["hypothesis.md", "setup.md", "findings.md", "decision.md"]) {
        await expect(
          access(join(experimentsDir, directory, filename)),
          `${directory}/${filename} must exist`,
        ).resolves.toBeUndefined();
      }
    }
  });

  it("keeps experiment evidence paths in claims.yaml resolvable", async () => {
    const claims = await readFile(join(root, "evidence", "claims.yaml"), "utf8");
    const referencedPaths = [...claims.matchAll(/^\s*-\s+(experiments\/[^\s]+)\s*$/gm)]
      .map((match) => match[1]!);

    expect(referencedPaths.length).toBeGreaterThan(0);
    for (const path of referencedPaths) {
      await expect(access(join(root, path)), `claims evidence path must exist: ${path}`).resolves.toBeUndefined();
    }
  });

  it("keeps claim ids unique", async () => {
    const claims = await readFile(join(root, "evidence", "claims.yaml"), "utf8");
    const ids = [...claims.matchAll(/^\s*- id: (ENG-\d+)\s*$/gm)].map((match) => match[1]!);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
