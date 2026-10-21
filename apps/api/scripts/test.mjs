// Runs the API test suite in a brand-new, run-scoped Postgres schema inside TEST_DATABASE_URL:
// creates the schema with `prisma migrate deploy`, runs vitest, then drops only that schema.
// Existing data in any database or schema is never touched.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const base = process.env.TEST_DATABASE_URL;
if (!base) {
  console.error('TEST_DATABASE_URL is not set. Copy .env.example to .env.');
  process.exit(1);
}
const schema = `test_run_${Date.now()}`;
const url = new URL(base);
url.searchParams.set('schema', schema);
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  NODE_ENV: 'test',
  ENABLE_DEMO_LOGIN: 'true',
  DEMO_USER_PASSWORD: 'Demo@2026',
  LOG_LEVEL: 'silent',
  STORAGE_DIR: './.data/test-storage',
};

let code = 0;
try {
  execSync('npx prisma migrate deploy', { stdio: ['ignore', 'ignore', 'inherit'], env });
  execSync(`npx vitest run ${process.argv.slice(2).join(' ')}`, { stdio: 'inherit', env });
} catch {
  code = 1;
} finally {
  try {
    execSync(`npx prisma db execute --stdin --url "${url.toString()}"`, { input: `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`, env, stdio: ['pipe', 'ignore', 'inherit'] });
  } catch {
    console.warn(`Could not drop temporary schema ${schema}; remove it manually if needed.`);
  }
}
process.exit(code);
