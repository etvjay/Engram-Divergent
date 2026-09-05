import { createCockroachPool } from "../packages/cockroach/src/client.js";
import { applyEngramMigrations } from "../packages/cockroach/src/migrations.js";

async function main() {
  const pool = createCockroachPool();
  try {
    await applyEngramMigrations(pool, {
      onApplied: (file) => console.log(`Applied db/migrations/${file}`),
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
