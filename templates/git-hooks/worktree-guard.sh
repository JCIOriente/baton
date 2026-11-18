# baton worktree-guard v2
# While hooks.worktreeOnly is on in the main checkout's committed .baton/config.json, refuses
# commits in the main checkout and in linked worktrees outside <main checkout>/.worktrees/.
# Installed by `baton hooks install`, which rewrites this file on every run.
# Any error lets the commit through: the guard must never be what breaks a commit.

# CI and cloud sessions are single-use clones that nobody else shares.
[ "$CI" = true ] && exit 0
[ "$CLAUDE_CODE_REMOTE" = true ] && exit 0
command -v node >/dev/null 2>&1 || exit 0

git_dir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null) || exit 0
common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
if [ "$git_dir" = "$common_dir" ]; then
  linked=0
  main=$top
else
  # A linked worktree has its own git dir under the common dir. Its main checkout is the folder
  # holding the common dir; a bare repository or a separate git dir has none, so it passes.
  linked=1
  case $common_dir in
    */.git) main=${common_dir%/.git} ;;
    *) exit 0 ;;
  esac
fi

# The switch comes from the main checkout's HEAD, so neither an uncommitted edit nor a branch
# can turn it off, and the adoption commit (no config at HEAD yet) goes through. Prints the
# refusal when the commit is refused, nothing otherwise.
msg=$(git --git-dir="$common_dir" show HEAD:.baton/config.json 2>/dev/null | node -e '
  try {
    const fs = require("fs");
    const path = require("path");
    const [linked, top, main] = process.argv.slice(1);
    // Quotes a path for pasting into a shell (\x27 is a single quote, which this script cannot hold).
    const shq = (p) => /^[\w.\/-]+$/.test(p) ? p : "\x27" + p.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
    const c = JSON.parse(fs.readFileSync(0, "utf8"));
    const hooks = c && typeof c === "object" && !Array.isArray(c) ? (c.hooks ?? {}) : null;
    const on = hooks && typeof hooks === "object" && (hooks.worktreeOnly ?? true) === true;
    if (!on) process.exit(0);
    if (linked === "1") {
      // Real paths on both sides, so a symlink in either path cannot make a worktree look outside.
      // git already hands over real paths for top and main; resolving them is defensive only. The
      // .worktrees folder itself may be a symlink, and that one matters.
      const home = path.join(fs.realpathSync(main), ".worktrees");
      const real = fs.realpathSync(top);
      const rel = path.relative(fs.existsSync(home) ? fs.realpathSync(home) : home, real);
      if (rel !== "" && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel)) process.exit(0);
      process.stdout.write([
        `baton: this worktree is outside .worktrees/ (${real}).`,
        `Every worktree lives in ${home}/. Move it with:`,
        `  git worktree move ${shq(real)} ${shq(path.join(home, path.basename(real)))}`,
      ].join("\n"));
      process.exit(0);
    }
    const git = (c.git && typeof c.git === "object") ? c.git : {};
    const ref = `${git.remote ?? "origin"}/${git.baseBranch ?? "main"}`;
    process.stdout.write([
      "baton: commits in the main checkout are refused (hooks.worktreeOnly in .baton/config.json).",
      "Make the change in a linked worktree:",
      "  baton worktree add <name>",
      `  (without baton on PATH: git worktree add --no-track -b <name> .worktrees/<name> ${/^[\w.\/-]+$/.test(ref) ? ref : "origin/main"})`,
    ].join("\n"));
  } catch {}
' "$linked" "$top" "$main" 2>/dev/null) || exit 0
[ -n "$msg" ] || exit 0

printf '%s\n' "$msg" >&2
exit 1
