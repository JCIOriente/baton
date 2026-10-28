#!/usr/bin/env bash
# Small JS project that uses baton: config, one module, an approved spec, a failing test.
# Usage: baton-repo.sh [--no-baton]   (--no-baton leaves out .baton/ for negative cases)
set -euo pipefail

git init -q -b main
git config user.email eval@example.com
git config user.name eval

mkdir -p src test docs/specs
cat > package.json <<'JSON'
{ "name": "members", "type": "module", "scripts": { "test": "node --test" } }
JSON

cat > src/dates.js <<'JS'
export function formatDate(date, locale = 'en') {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
JS

cat > src/export.js <<'JS'
export function toCsv(members) {
  return members.map((m) => `${m.profile.id},${m.name}`).join('\n');
}
JS

cat > test/export.test.js <<'JS'
import { test } from 'node:test';
import assert from 'node:assert';
import { toCsv } from '../src/export.js';

test('toCsv', () => {
  assert.strictEqual(toCsv([{ id: 1, name: 'Ana' }]), '1,Ana');
});
JS

cat > docs/specs/2026-10-20-attendance-export.md <<'MD'
# Attendance export

Status: approved

Members can download their attendance history as CSV from their profile page.
One row per event: date, event name, local organization, attended (yes/no).
MD

if [[ "${1:-}" != "--no-baton" ]]; then
  mkdir -p .baton
  cat > .baton/config.json <<'JSON'
{
  "project": "members",
  "stacks": ["javascript", "node"],
  "tasks": { "provider": "github", "repo": "example/members" },
  "validate": [{ "name": "test", "run": "npm test" }],
  "docs": { "specs": "docs/specs", "plans": "docs/plans" }
}
JSON
fi

git add -A
git commit -q -m "Initial project"
