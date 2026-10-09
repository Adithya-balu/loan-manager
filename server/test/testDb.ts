import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Connection string for the integration-test database. Uses TEST_DATABASE_URL
 * when set; otherwise derives `<db>_test` from DATABASE_URL in server/.env.
 * Refuses anything whose database name doesn't end in `_test`, since the
 * tests truncate every table.
 */
export function testDatabaseUrl(): string {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const envFile = path.join(SERVER_DIR, '.env');
    const line = fs.existsSync(envFile)
      ? fs.readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))
      : undefined;
    const base = line?.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
    if (!base) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL in server/.env to run tests');
    const u = new URL(base);
    u.pathname = `${u.pathname.replace(/_test$/, '')}_test`;
    url = u.toString();
  }
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${dbName}": database name must end with _test`);
  }
  return url;
}

export { SERVER_DIR };
