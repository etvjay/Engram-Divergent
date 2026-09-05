import { access, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type pg from "pg";

const MODULE_RELATIVE_MIGRATIONS_DIR = resolve(
  fileURLToPath(new URL("../../../db/migrations/", import.meta.url)),
);
const REPOSITORY_MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");

export const DEFAULT_MIGRATIONS_DIR = MODULE_RELATIVE_MIGRATIONS_DIR;

async function resolveDefaultMigrationsDir(): Promise<string> {
  try {
    await access(MODULE_RELATIVE_MIGRATIONS_DIR);
    return MODULE_RELATIVE_MIGRATIONS_DIR;
  } catch {
    await access(REPOSITORY_MIGRATIONS_DIR);
    return REPOSITORY_MIGRATIONS_DIR;
  }
}

export async function listMigrationFiles(migrationsDir?: string): Promise<string[]> {
  const resolvedMigrationsDir = migrationsDir ?? await resolveDefaultMigrationsDir();
  return (await readdir(resolvedMigrationsDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort((a, b) => a.localeCompare(b));
}

export async function applyEngramMigrations(
  pool: pg.Pool,
  options: {
    migrationsDir?: string;
    onApplied?: (file: string) => void;
  } = {},
): Promise<string[]> {
  const migrationsDir = options.migrationsDir ?? await resolveDefaultMigrationsDir();
  const files = await listMigrationFiles(migrationsDir);

  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    await pool.query(sql);
    options.onApplied?.(file);
  }

  return files;
}
