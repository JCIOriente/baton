import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** Find manifests at the root and one level down (covers simple monorepos: apps/*, crates/*). */
function manifests(root, name) {
  const found = [];
  if (existsSync(join(root, name))) found.push(join(root, name));
  for (const dir of ['.', 'apps', 'packages', 'crates', 'services']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target') continue;
      const p = join(base, entry.name, name);
      if (existsSync(p) && !found.includes(p)) found.push(p);
    }
  }
  return found;
}

/** Guess stacks and a package manager from manifests. Used only to seed `baton init`. */
export function detectStacks(root) {
  const stacks = new Set();
  let packageManager = null;

  for (const p of manifests(root, 'package.json')) {
    const pkg = readJson(p) ?? {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    stacks.add('javascript');
    if (deps.typescript || existsSync(join(p, '..', 'tsconfig.json'))) stacks.add('typescript');
    if (deps.react) stacks.add('react');
    if (!deps.react || deps.express || deps.fastify || deps.hono || deps['@nestjs/core']) stacks.add('node');
  }
  if (stacks.has('typescript')) stacks.delete('javascript');

  if (existsSync(join(root, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
  else if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) packageManager = 'bun';
  else if (existsSync(join(root, 'yarn.lock'))) packageManager = 'yarn';
  else if (existsSync(join(root, 'package-lock.json'))) packageManager = 'npm';

  for (const p of manifests(root, 'Cargo.toml')) {
    stacks.add('rust');
    if (/^\s*tokio-postgres\s*=/m.test(read(p))) stacks.add('rust-tokio-postgres');
  }

  return { stacks: [...stacks], packageManager };
}

/** Suggest validation commands for the detected stacks. The user is expected to review them. */
export function suggestValidate({ stacks, packageManager }) {
  const v = [];
  if (stacks.includes('rust') || stacks.includes('rust-tokio-postgres')) {
    v.push({ name: 'fmt', run: 'cargo fmt --all -- --check' });
    v.push({ name: 'clippy', run: 'cargo clippy --all-targets --all-features -- -D warnings' });
    v.push({ name: 'cargo-test', run: 'cargo test --all' });
  }
  if (packageManager) {
    const pm = packageManager === 'npm' ? 'npm run' : packageManager;
    if (stacks.includes('typescript')) v.push({ name: 'typecheck', run: `${pm} typecheck` });
    v.push({ name: 'lint', run: `${pm} lint` });
    v.push({ name: 'js-test', run: `${pm} test` });
  }
  return v;
}
