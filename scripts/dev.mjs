#!/usr/bin/env node
/**
 * Concurrent dev server runner.
 *
 * Usage: node scripts/dev.mjs [apps...]
 *   default: api + website
 *   example: node scripts/dev.mjs api admin website
 *
 * Starts each requested app as a child process and forwards its stdout/stderr.
 * Exits (killing children) on Ctrl+C.
 */
import { spawn } from 'node:child_process';

const APPS = {
  api: { cwd: 'apps/api', cmd: 'npm', args: ['run', 'start:dev'] },
  admin: { cwd: 'apps/admin', cmd: 'npx', args: ['ng', 'serve'] },
  website: { cwd: 'apps/website', cmd: 'npx', args: ['ng', 'serve'] },
};

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : ['api', 'website'];

const children = new Map();
for (const name of names) {
  if (!APPS[name]) {
    console.error(`Unknown app "${name}". Valid: ${Object.keys(APPS).join(', ')}`);
    process.exit(1);
  }
}

for (const name of names) {
  const { cwd, cmd, args } = APPS[name];
  const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${name}] `;
  child.stdout.on('data', (d) =>
    process.stdout.write(prefix + d.toString().replace(/\n$/, '') + '\n'),
  );
  child.stderr.on('data', (d) =>
    process.stderr.write(prefix + d.toString().replace(/\n$/, '') + '\n'),
  );
  child.on('exit', (code) => {
    console.error(`${prefix}exited (code ${code})`);
    children.delete(name);
    if (children.size === 0) process.exit(code ?? 0);
  });
  children.set(name, child);
}

process.on('SIGINT', () => {
  for (const child of children.values()) child.kill('SIGINT');
  process.exit(0);
});