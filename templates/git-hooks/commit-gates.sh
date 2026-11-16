# baton commit-gates v1
# Runs `baton verify --stage commit` for commits in linked worktrees and refuses the commit when
# it fails. Installed by `baton hooks install`, which rewrites this file on every run.
# Unlike the worktree guard, a gate that can't run fails the commit: a gate that silently
# doesn't run isn't a gate.

# CI runs the gates itself.
[ "$CI" = true ] && exit 0

git_dir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null) || exit 0
common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
# The main checkout is the worktree guard's to decide.
[ "$git_dir" != "$common_dir" ] || exit 0
# A checkout without a baton config, such as a branch from before the repo adopted baton, has no gates.
top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$top/.baton/config.json" ] || exit 0

if ! command -v baton >/dev/null 2>&1; then
  printf '%s\n' \
    'baton: the commit gates need baton on PATH. Install it:' \
    '  npm install -g @jcioriente/baton' >&2
  exit 1
fi

tmp=$(mktemp -d 2>/dev/null) || { echo 'baton: the commit gates could not create a temporary directory.' >&2; exit 1; }
trap 'rm -rf "$tmp"' EXIT
# The output streams as it runs and is kept to tell an old baton from a failing step.
{ baton verify --stage commit 2>&1; echo $? >"$tmp/status"; } | tee "$tmp/log" >&2
[ "$(cat "$tmp/status")" = 0 ] && exit 0

# The error a baton older than `--stage` prints for the unknown option: since 0.6.0 as a baton
# error, before that as an unexpected error with parseArgs' stack.
if grep -qE "^(baton: Unknown option '--stage'$|TypeError \[ERR_PARSE_ARGS_UNKNOWN_OPTION\]: Unknown option '--stage'\.)" "$tmp/log"; then
  printf '%s\n' \
    'baton: the baton on PATH is too old to run the commit gates. Upgrade it:' \
    '  npm install -g @jcioriente/baton@latest' >&2
fi
exit 1
