# baton worktree-guard v1
# Refuses commits in the main checkout while hooks.worktreeOnly is on in the committed
# .baton/config.json. Installed by `baton hooks install`, which rewrites this file on every run.
# Any error lets the commit through: the guard must never be what breaks a commit.

# CI and cloud sessions are single-use clones that nobody else shares.
[ "$CI" = true ] && exit 0
[ "$CLAUDE_CODE_REMOTE" = true ] && exit 0
command -v node >/dev/null 2>&1 || exit 0

git_dir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null) || exit 0
common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
# A linked worktree has its own git dir under the common dir.
[ "$git_dir" = "$common_dir" ] || exit 0

# The switch comes from HEAD, so an uncommitted edit can't turn it off and the adoption commit
# (no config at HEAD yet) goes through. Prints "<remote>/<base>" when on, nothing otherwise.
base=$(git show HEAD:.baton/config.json 2>/dev/null | node -e '
  try {
    const c = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const hooks = c && typeof c === "object" && !Array.isArray(c) ? (c.hooks ?? {}) : null;
    const on = hooks && typeof hooks === "object" && (hooks.worktreeOnly ?? true) === true;
    const git = (c.git && typeof c.git === "object") ? c.git : {};
    const ref = `${git.remote ?? "origin"}/${git.baseBranch ?? "main"}`;
    if (on) process.stdout.write(/^[\w.\/-]+$/.test(ref) ? ref : "origin/main");
  } catch {}
' 2>/dev/null) || exit 0
[ -n "$base" ] || exit 0

top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
repo=${top##*/}
printf '%s\n' \
  'baton: commits in the main checkout are refused (hooks.worktreeOnly in .baton/config.json).' \
  'Make the change in a linked worktree:' \
  '  baton worktree add <name>' \
  "  (without baton on PATH: git worktree add --no-track -b <name> ../$repo-worktrees/<name> $base)" >&2
exit 1
