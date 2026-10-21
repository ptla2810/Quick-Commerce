// Starts a real PostgreSQL 17 server for local development without Docker or Homebrew.
// Data lives in apps/api/.data/pg and survives restarts. Stop with Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../.data/pg');
const port = Number(process.env.PG_PORT ?? 5433);
const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'padosi',
  password: 'padosi_dev_password',
  port,
  persistent: true,
  onLog: () => {},
});

if (fresh) await pg.initialise();
await pg.start();
for (const db of ['padosi', 'padosi_test']) {
  try {
    await pg.createDatabase(db);
    console.log(`created database ${db}`);
  } catch {
    // already exists
  }
}
console.log(`PostgreSQL 17 running on localhost:${port} (data: ${dataDir}). Press Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
