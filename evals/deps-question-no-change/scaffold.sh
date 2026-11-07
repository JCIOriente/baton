#!/usr/bin/env bash
# The baton fixture plus a zod dependency, so the question names a real dependency.
set -euo pipefail
bash "$(dirname "$0")/../_fixtures/baton-repo.sh"
cat > package.json <<'JSON'
{ "name": "members", "type": "module", "scripts": { "test": "node --test" }, "dependencies": { "zod": "^4.1.12" } }
JSON
git add -A
git commit -q -m "Add zod"
