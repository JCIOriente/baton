import { hasDependencies } from './detect.mjs';

// Catalog order: static gates come first; verify runs steps in config order, doctor checks this order.
const CATALOG = [
  ['secrets', true],
  ['install', true],
  ['format', true],
  ['lint', true],
  ['structure', true],
  ['types', true],
  ['generated', true],
  ['migrations', false],
  ['dead-code', true],
  ['unused-deps', true],
  ['audit', true],
  ['unit-tests', false],
  ['integration-tests', false],
  ['build', false],
  ['budget', false],
  ['e2e', false],
  ['publish', false],
];

export const GATES = Object.freeze(CATALOG.map(([g]) => g));
export const STATIC_GATES = new Set(CATALOG.filter(([, s]) => s).map(([g]) => g));
export const STAGES = Object.freeze(['commit', 'local', 'ci']);
export const DEFAULT_STAGES = Object.freeze(['local', 'ci']);

/** Fill a validate step's defaults. */
export function normalizeStep(step) {
  const out = {
    name: step.name ?? step.run,
    run: step.run,
    ...(step.cwd !== undefined && { cwd: step.cwd }),
    gates: step.gates ? [...step.gates] : [],
    stages: step.stages ? [...step.stages] : [...DEFAULT_STAGES],
    blocking: step.blocking ?? true,
  };
  if (step.reason !== undefined) out.reason = step.reason;
  return out;
}

/** Gates that apply to this repo, in catalog order. */
export function applicableGates({ root, config }) {
  const stacks = config.stacks ?? [];
  const has = (...names) => names.find((s) => stacks.includes(s));
  const deps = hasDependencies(root);
  const rules = {
    secrets: () => 'always',
    format: () => 'always',
    lint: () => 'always',
    structure: () => 'always',
    'unit-tests': () => 'always',
    install: () => deps && 'a package.json with dependencies or a Cargo.toml exists',
    audit: () => deps && 'a package.json with dependencies or a Cargo.toml exists',
    'unused-deps': () => deps && 'a package.json with dependencies or a Cargo.toml exists',
    types: () => has('typescript', 'rust', 'rust-tokio-postgres') && `stack ${has('typescript', 'rust', 'rust-tokio-postgres')} enabled`,
    migrations: () => has('postgres') && 'stack postgres enabled',
    e2e: () => has('e2e') && 'stack e2e enabled',
    build: () => has('react') && 'stack react enabled',
    publish: () => config.release?.publish?.length > 0 && 'release.publish is set',
  };
  return GATES.flatMap((gate) => {
    const why = rules[gate]?.();
    return why ? [{ gate, why }] : [];
  });
}

/** Doctor findings: applicable gates nobody covers or skips, and steps that cover no gate. */
export function coverageFindings(config, applicable) {
  const steps = (config.validate ?? []).map(normalizeStep);
  const covered = new Set(steps.flatMap((s) => s.gates));
  const skipped = config.gates?.skip ?? {};
  const findings = [];
  for (const { gate, why } of applicable) {
    if (!covered.has(gate) && !Object.hasOwn(skipped, gate)) {
      findings.push({ kind: 'gates', message: `gate '${gate}' applies (${why}) but no step covers it and gates.skip doesn't list it` });
    }
  }
  for (const s of steps) if (!s.gates.length) findings.push({ kind: 'gates', message: `step '${s.name}' covers no gate` });
  return findings;
}

/** Doctor findings: a step with static gates that runs after a step with non-static gates. */
export function orderFindings(steps) {
  const findings = [];
  steps.forEach((s, i) => {
    const mine = s.gates.filter((g) => STATIC_GATES.has(g));
    if (!mine.length) return;
    const earlier = steps.slice(0, i).find((e) => e.gates.some((g) => !STATIC_GATES.has(g)));
    if (!earlier) return;
    const theirs = earlier.gates.filter((g) => !STATIC_GATES.has(g));
    findings.push({
      kind: 'gates',
      message: `step '${s.name}' runs ${mine.join(', ')} after '${earlier.name}' (${theirs.join(', ')})`,
    });
  });
  return findings;
}
