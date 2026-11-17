// Running configured steps: `setup` (every step blocks) and the validate stages (`verify`, `start`'s
// baseline, `done`), which run advisory steps and report per gate.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeStep } from './gates.mjs';
import { BatonError, runShell } from './util.mjs';

/** Run one step with today's stderr lines. Returns its exit code; a missing `cwd` fails the step. */
function runStep(step, top, label) {
  process.stderr.write(`\n▶ [${label}] ${step.name}: ${step.run}\n`);
  const cwd = step.cwd ? join(top, step.cwd) : top;
  if (!existsSync(cwd)) {
    process.stderr.write(`✖ ${step.name} failed (cwd ${step.cwd} not found)\n`);
    return null;
  }
  const code = runShell(step.run, { cwd, stdout: 'stderr' });
  if (code !== 0) process.stderr.write(`✖ ${step.name} failed (exit ${code})\n`);
  else process.stderr.write(`✔ ${step.name}\n`);
  return code;
}

/** Run `setup` steps ({ name, run, cwd? }) in order, stopping at the first failure. Output goes to stderr. */
export function runSetup(steps, top) {
  const results = [];
  for (const step of steps) {
    const name = step.name ?? step.run;
    const code = runStep({ ...step, name }, top, 'setup');
    results.push({ name, run: step.run, code });
    if (code !== 0) return { ok: false, results };
  }
  return { ok: true, results };
}

/**
 * Run the validate steps of one stage in config order. A failing blocking step stops the run and
 * marks the rest `not-run`; a failing advisory step is reported and the run goes on.
 * `only` keeps the stage's steps named `only` or covering gate `only`; no match throws a
 * BatonError listing the stage's steps. `skip` is `gates.skip`.
 */
export function runStage(steps, top, { stage, only, label, skip }) {
  const all = steps.map(normalizeStep);
  const inStage = all.filter((s) => s.stages.includes(stage));
  const selected = only === undefined ? inStage : inStage.filter((s) => s.name === only || s.gates.includes(only));
  if (only !== undefined && !selected.length) {
    const names = inStage.map((s) => s.name).join(', ') || '(none)';
    throw new BatonError(`No step or gate named '${only}' in stage '${stage}'`, { hint: `Steps in stage '${stage}': ${names}.` });
  }
  const results = [];
  let stopped = false;
  for (const s of selected) {
    const entry = { name: s.name, run: s.run, gates: s.gates, blocking: s.blocking, ...(s.reason !== undefined && { reason: s.reason }) };
    if (stopped) {
      results.push({ ...entry, status: 'not-run', code: null });
      continue;
    }
    const code = runStep(s, top, label);
    results.push({ ...entry, status: code === 0 ? 'passed' : 'failed', code });
    if (code !== 0 && s.blocking) stopped = true;
  }
  return {
    ok: !stopped,
    stage,
    narrowed: only !== undefined,
    ...(only !== undefined && { only }),
    results,
    notInStage: all.filter((s) => !s.stages.includes(stage)).map((s) => ({ name: s.name, run: s.run, stages: s.stages })),
    skipped: Object.entries(skip ?? {}).map(([gate, reason]) => ({ gate, reason })),
  };
}

/** The `--json` shape of a RunResult, without the fields kept for the summary and the PR body. */
export function stageJson(res) {
  return {
    ok: res.ok,
    stage: res.stage,
    narrowed: res.narrowed,
    results: res.results.map(({ name, run, gates, blocking, status, code }) => ({ name, run, gates, blocking, status, code })),
    notInStage: res.notInStage.map(({ name, stages }) => ({ name, stages })),
    skipped: res.skipped,
  };
}

/** The summary `verify` prints after the step lines. */
export function formatSummary(res) {
  if (!res.results.length) return `No validation steps in stage '${res.stage}'.`;
  const count = (fn) => res.results.filter(fn).length;
  const counts = [`${count((r) => r.status === 'passed')} passed`];
  const failed = count((r) => r.status === 'failed' && r.blocking);
  const advisory = count((r) => r.status === 'failed' && !r.blocking);
  const notRun = count((r) => r.status === 'not-run');
  if (failed) counts.push(`${failed} failed`);
  if (advisory) counts.push(`${advisory} advisory failed`);
  if (notRun) counts.push(`${notRun} not run`);

  const lines = [`verify (${res.stage}): ${counts.join(', ')}`];
  for (const r of res.results) {
    const gates = `[${r.gates.length ? r.gates.join(', ') : 'no gate'}]`;
    if (r.status === 'not-run') lines.push(`  · ${r.name} not run`);
    else if (r.status === 'passed') lines.push(`  ✔ ${r.name} ${gates}`);
    else if (r.blocking) lines.push(`  ✖ ${r.name} ${gates}`);
    else lines.push(`  ✖ ${r.name} ${gates} advisory: ${r.reason}`);
  }
  if (res.notInStage.length) lines.push(`not in this stage: ${res.notInStage.map((s) => `${s.name} (${s.stages.join(', ')})`).join(', ')}`);
  if (res.skipped.length) lines.push(`skipped gates: ${res.skipped.map((s) => `${s.gate} (${s.reason})`).join(', ')}`);
  if (res.narrowed) lines.push(`Narrowed run (--only ${res.only}): not a gate run.`);
  return lines.join('\n');
}
