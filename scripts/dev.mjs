// One command for local development: starts PostgreSQL (embedded), the API and the web app.
// Usage: npm run dev   (Ctrl+C stops everything)
import { spawn } from 'node:child_process';
import net from 'node:net';

const procs = [];
const colors = { db: 35, api: 36, web: 32 };

function run(name, cmd, args) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = `\x1b[${colors[name]}m[${name}]\x1b[0m`;
  const out = (d) => process.stdout.write(d.toString().split('\n').filter(Boolean).map((l) => `${tag} ${l}\n`).join(''));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => {
    console.log(`${tag} exited with code ${code}`);
    if (name !== 'db') shutdown(code ?? 1);
  });
  procs.push(p);
  return p;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => (s.destroy(), resolve(true)));
    s.on('error', () => resolve(false));
  });
}

async function waitFor(port, label, timeoutMs = 120_000) {
  const start = Date.now();
  while (!(await portOpen(port))) {
    if (Date.now() - start > timeoutMs) throw new Error(`${label} did not start on port ${port}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function shutdown(code = 0) {
  for (const p of procs) p.kill('SIGINT');
  setTimeout(() => process.exit(code), 1500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (await portOpen(5433)) console.log('PostgreSQL already running on 5433');
else {
  run('db', npm, ['run', 'db:start', '-w', '@padosi/api']);
  await waitFor(5433, 'PostgreSQL');
}
run('api', npm, ['run', 'dev', '-w', '@padosi/api']);
await waitFor(4000, 'API');
run('web', npm, ['run', 'dev', '-w', '@padosi/web']);
await waitFor(3000, 'Web');
console.log('\n  Web app:  http://localhost:3000\n  API:      http://localhost:4000/api/health\n');
