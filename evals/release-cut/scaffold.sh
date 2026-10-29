#!/usr/bin/env bash
# The baton fixture with releases turned on (squash merges are required for that).
set -euo pipefail
bash "$(dirname "$0")/../_fixtures/baton-repo.sh"
node -e '
const fs = require("fs");
const path = ".baton/config.json";
const config = JSON.parse(fs.readFileSync(path, "utf8"));
config.git = { mergeStrategy: "squash" };
config.release = { enabled: true, publish: [] };
fs.writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
'
git commit -q -am "Enable releases"
