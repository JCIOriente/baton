import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { currentBranch, currentTop, issueFromBranch } from './git.mjs';
import { BASELINE_GUIDE } from './config.mjs';
import { detectStacks } from './detect.mjs';

// Agents skip optional skills often, so the rules that must never be skipped are always in context.
export const ALWAYS_RULES = [
  'Never work on a task you have not claimed (`baton start <n>`), and edit only inside its worktree.',
  'Every changed line traces back to the task: no drive-by refactors or reformatting; mention unrelated problems instead of fixing them.',
  'If a requirement is ambiguous or a simpler approach exists, say so and ask before building.',
  'Never say done, fixed or passing without fresh `baton verify` output from after your last change.',
];

/**
 * Build the text injected at session start. Only the stacks and rules the project
 * enabled are referenced, so unrelated guidance never enters the context.
 */
export function buildContext({ root, found, config }, { pluginRoot, cwd = process.cwd() }) {
  if (!found) {
    return [
      '<baton>',
      'baton is installed but this repo has no .baton/config.json.',
      'If the user wants the baton workflow here, use the baton:init skill. Otherwise ignore baton.',
      '</baton>',
    ].join('\n');
  }

  const lines = ['<baton>', `Project: ${config.project ?? root}. This repo uses the baton workflow.`];
  lines.push('Load the baton:workflow skill before starting any feature, bug fix or task in this repo.');
  lines.push('', 'Always, even without loading a skill:');
  for (const rule of ALWAYS_RULES) lines.push(`- ${rule}`);
  lines.push('');

  const gates = [];
  if (config.workflow.requireSpec) gates.push('spec before plan');
  if (config.workflow.requireTdd) gates.push('tests first');
  if (config.workflow.requireReview) gates.push('review before merge');
  lines.push(`Phases: ${config.workflow.phases.join(' -> ')}${gates.length ? ` (gates: ${gates.join(', ')})` : ''}`);
  const custom = Object.entries(config.workflow.custom ?? {}).filter(([p]) => config.workflow.phases.includes(p));
  for (const [phase, file] of custom) lines.push(`- Custom phase '${phase}': follow ${join(root, file)}`);
  if (config.release.enabled) {
    lines.push('Releases: on demand with baton:release. Never edit CHANGELOG.md or version files in a task PR; the PR title is the changelog entry.');
  }

  if (config.stacks.length) {
    lines.push('', 'Enabled stack guides. Read the relevant ones before writing or reviewing code in that stack:');
    for (const s of [BASELINE_GUIDE, ...config.stacks]) lines.push(`- ${s}: ${join(pluginRoot, 'stacks', `${s}.md`)}`);
  }
  const notEnabled = safeDetect(root).filter((s) => !config.stacks.includes(s));
  if (notEnabled.length) {
    lines.push(`Detected but not enabled: ${notEnabled.join(', ')}. Suggest adding them to "stacks" in .baton/config.json if the project uses them.`);
  }
  const conventions = config.conventions.map((c) => join(root, c)).filter((p) => existsSync(p));
  if (conventions.length) {
    lines.push('', 'Project conventions (these override the stack guides when they conflict):');
    for (const c of conventions) lines.push(`- ${c}`);
  }
  const issues = config.docs.commonIssues && join(root, config.docs.commonIssues);
  if (issues && existsSync(issues)) {
    lines.push('', `Known recurring bug patterns in this repo. Check before coding: ${issues}`);
  }
  if (config.validate.length) {
    lines.push('', 'Validation (`baton verify` runs all of them):');
    for (const v of config.validate) lines.push(`- ${v.name ?? v.run}: \`${v.run}\`${v.cwd ? ` (in ${v.cwd})` : ''}`);
  }

  try {
    const top = currentTop(cwd);
    const branch = currentBranch(cwd);
    const issue = issueFromBranch(config, branch);
    if (issue) lines.push('', `Current checkout: ${top} on ${branch}, working on task #${issue}.`);
  } catch {
    // Not fatal: the hook may run outside a checkout.
  }

  lines.push('</baton>');
  return lines.join('\n');
}

function safeDetect(root) {
  try {
    return detectStacks(root).stacks;
  } catch {
    return [];
  }
}
