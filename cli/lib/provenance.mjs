// Provenance and drift: where baton's adapted content came from, which version facts its guides
// assert, and checks that tell when either has moved. See provenance.json at the plugin root.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, BatonError } from './util.mjs';

export function loadProvenance(pluginRoot) {
  return JSON.parse(readFileSync(join(pluginRoot, 'provenance.json'), 'utf8'));
}

// --- Versions -------------------------------------------------------------

function parseVersion(v) {
  const m = String(v).trim().replace(/^v/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** True if `version` satisfies every space-separated comparator in `range` (>=, >, <=, <, =). */
export function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  return range
    .trim()
    .split(/\s+/)
    .every((part) => {
      const m = part.match(/^(>=|<=|>|<|=)?(.+)$/);
      const target = parseVersion(m[2]);
      if (!target) throw new BatonError(`Bad version range '${range}'`);
      const c = compare(v, target);
      return { '>=': c >= 0, '<=': c <= 0, '>': c > 0, '<': c < 0, '=': c === 0, undefined: c === 0 }[m[1]];
    });
}

// --- Lockfiles (consumer repos) -------------------------------------------

/** Installed package versions from npm, pnpm and Cargo lockfiles: Map<"npm:name"|"crates:name", Set<version>>. */
export function installedVersions(root) {
  const found = new Map();
  const add = (key, version) => {
    if (!found.has(key)) found.set(key, new Set());
    found.get(key).add(version);
  };

  const npmLock = join(root, 'package-lock.json');
  if (existsSync(npmLock)) {
    const lock = JSON.parse(readFileSync(npmLock, 'utf8'));
    for (const [path, meta] of Object.entries(lock.packages ?? {})) {
      const m = path.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/);
      if (m && meta.version) add(`npm:${m[1]}`, meta.version);
    }
  }

  const pnpmLock = join(root, 'pnpm-lock.yaml');
  if (existsSync(pnpmLock)) {
    const text = readFileSync(pnpmLock, 'utf8');
    const packages = text.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
    for (const m of packages.matchAll(/^ {2}'?((?:@[^/\s']+\/)?[^@\s']+)@(\d[^:'\s(]*)/gm)) add(`npm:${m[1]}`, m[2]);
  }

  const cargoLock = join(root, 'Cargo.lock');
  if (existsSync(cargoLock)) {
    for (const m of readFileSync(cargoLock, 'utf8').matchAll(/\[\[package\]\]\s*\nname = "([^"]+)"\s*\nversion = "([^"]+)"/g)) {
      add(`crates:${m[1]}`, m[2]);
    }
  }
  return found;
}

// --- Checks ---------------------------------------------------------------

/** Offline consistency of provenance.json with the files it describes. Used by the test suite. */
export function lintProvenance(pluginRoot, prov = loadProvenance(pluginRoot)) {
  const problems = [];
  for (const src of prov.sources) {
    if (!/^[0-9a-f]{40}$/.test(src.baseline?.sha ?? '')) problems.push(`${src.id}: baseline.sha must be a full commit SHA`);
    for (const f of src.files) if (!existsSync(join(pluginRoot, f.local))) problems.push(`${src.id}: ${f.local} does not exist`);
  }
  for (const fact of prov.facts) {
    const path = join(pluginRoot, fact.file);
    if (!existsSync(path)) problems.push(`${fact.id}: ${fact.file} does not exist`);
    else if (!readFileSync(path, 'utf8').includes(fact.anchor)) problems.push(`${fact.id}: anchor "${fact.anchor}" not found in ${fact.file}`);
    try {
      satisfies('0.0.0', fact.requires);
    } catch (err) {
      problems.push(`${fact.id}: ${err.message}`);
    }
  }
  return problems;
}

/** Consumer check: installed dependency versions that fall outside what a guide rule assumes. */
export function factsVsInstalled(prov, installed) {
  const findings = [];
  for (const fact of prov.facts) {
    for (const version of installed.get(fact.pkg) ?? []) {
      if (!satisfies(version, fact.requires)) {
        findings.push({ kind: 'version', fact: fact.id, pkg: fact.pkg, installed: version, requires: fact.requires, file: fact.file, note: fact.note });
      }
    }
  }
  return findings;
}

async function latestVersion(pkg) {
  const [registry, name] = [pkg.slice(0, pkg.indexOf(':')), pkg.slice(pkg.indexOf(':') + 1)];
  const signal = AbortSignal.timeout(10_000);
  if (registry === 'npm') {
    const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`, { signal });
    if (!res.ok) throw new Error(`npm ${res.status}`);
    return (await res.json()).version;
  }
  if (registry === 'crates') {
    const res = await fetch(`https://crates.io/api/v1/crates/${name}`, { signal, headers: { 'User-Agent': 'baton-upstream (https://github.com)' } });
    if (!res.ok) throw new Error(`crates.io ${res.status}`);
    return (await res.json()).crate.max_stable_version;
  }
  throw new Error(`unsupported registry '${registry}'`);
}

/** Maintainer check (network): upstream changes to adapted files, and new releases outside asserted ranges. */
export async function upstreamFindings(prov) {
  const findings = [];
  for (const src of prov.sources) {
    const res = run('gh', ['api', `repos/${src.repo}/compare/${src.baseline.sha}...HEAD`, '--jq', '{ahead: .ahead_by, head: .commits[-1].sha, files: [.files[] | {filename, status, additions, deletions}]}'], { allowFail: true });
    if (res.code !== 0) {
      findings.push({ kind: 'error', source: src.id, message: res.stderr || 'compare failed' });
      continue;
    }
    const cmp = JSON.parse(res.stdout);
    const changed = (cmp.files ?? []).flatMap((f) =>
      src.files.filter((t) => f.filename === t.upstream || f.filename.startsWith(t.upstream)).map((t) => ({ ...f, local: t.local })),
    );
    if (changed.length) findings.push({ kind: 'upstream', source: src.id, repo: src.repo, ahead: cmp.ahead, head: cmp.head, changed, truncated: (cmp.files ?? []).length >= 300 });
  }
  for (const fact of prov.facts) {
    try {
      const latest = await latestVersion(fact.pkg);
      if (!satisfies(latest, fact.requires)) findings.push({ kind: 'release', fact: fact.id, pkg: fact.pkg, latest, requires: fact.requires, file: fact.file });
    } catch (err) {
      findings.push({ kind: 'error', fact: fact.id, message: err.message });
    }
  }
  return findings;
}
