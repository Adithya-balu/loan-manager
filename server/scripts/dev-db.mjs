// Starts a self-contained local Postgres instance for development, with no
// system-level install or sudo required. Data persists in server/.pgdata
// across restarts. Run with: node scripts/dev-db.mjs
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../.pgdata');
const isNew = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
});

if (isNew) {
  console.log('Initialising a new local Postgres cluster at', dataDir);
  await pg.initialise();
}

await pg.start();
console.log('Postgres is listening on postgresql://postgres:postgres@localhost:5433');

if (isNew) {
  await pg.createDatabase('loan_manager');
  console.log('Created database "loan_manager"');
}

async function shutdown() {
  console.log('Stopping Postgres...');
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep the process alive so the server stays up.
await new Promise(() => {});
