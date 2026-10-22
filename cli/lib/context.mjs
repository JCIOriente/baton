import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { currentBranch, currentTop, issueFromBranch } from './git.mjs';

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

  const gates = [];
  if (config.workflow.requireSpec) gates.push('spec before plan');
  if (config.workflow.requireTdd) gates.push('tests first');
  if (config.workflow.requireReview) gates.push('review before merge');
  lines.push(`Phases: ${config.workflow.phases.join(' -> ')}${gates.length ? ` (gates: ${gates.join(', ')})` : ''}`);
  const custom = Object.entries(config.workflow.custom ?? {}).filter(([p]) => config.workflow.phases.includes(p));
  for (const [phase, file] of custom) lines.push(`- Custom phase '${phase}': follow ${join(root, file)}`);

  if (config.stacks.length) {
    lines.push('', 'Enabled stack guides. Read the relevant ones before writing or reviewing code in that stack:');
    for (const s of config.stacks) lines.push(`- ${s}: ${join(pluginRoot, 'stacks', `${s}.md`)}`);
  }
  const conventions = config.conventions.map((c) => join(root, c)).filter((p) => existsSync(p));
  if (conventions.length) {
    lines.push('', 'Project conventions (these override the stack guides when they conflict):');
    for (const c of conventions) lines.push(`- ${c}`);
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
