import { execSync } from 'node:child_process';
import { SERVER_DIR, testDatabaseUrl } from './testDb';

/** Create (if needed) and migrate the test database once per run. */
export default function setup() {
  const url = testDatabaseUrl();
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PGPASSWORD: decodeURIComponent(u.password) };
  const user = u.username ? `-U "${decodeURIComponent(u.username)}"` : '';
  try {
    execSync(`createdb -h "${u.hostname}" -p ${u.port || 5432} ${user} "${dbName}"`, { env, stdio: 'ignore' });
  } catch {
    // Already exists, or createdb isn't on PATH — migrate will report a real problem.
  }
  execSync('npx prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'pipe' });
}
