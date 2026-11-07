#!/usr/bin/env bash
# The baton fixture plus a moment dependency that formats event dates.
set -euo pipefail
bash "$(dirname "$0")/../_fixtures/baton-repo.sh"
cat > package.json <<'JSON'
{ "name": "members", "type": "module", "scripts": { "test": "node --test" }, "dependencies": { "moment": "^2.30.1" } }
JSON
cat > src/events.js <<'JS'
import moment from 'moment';

export function formatEventDate(date) {
  return moment(date).format('D MMM YYYY');
}
JS
git add -A
git commit -q -m "Format event dates with moment"
