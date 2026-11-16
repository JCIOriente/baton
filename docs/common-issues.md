# Common issues

Bug patterns that recurred in this repo. Read before writing or reviewing code.

## Paths from issue bodies or flags reach output or the filesystem unchecked

- **Symptom:** a path taken from an issue body or a CLI flag is printed in full, matches nothing,
  or reads a file outside the checkout.
- **Cause:** the path was treated as trusted. Issue bodies are written by anyone with access to
  the repo, and flags may spell the same file several ways (`./x`, `docs/../x`, absolute).
- **Avoid:** accept only repo-relative paths of the expected form, canonicalize them before
  comparing, refuse any that resolve outside the checkout, and clip them before printing.
  Seen in #152 (spec paths printed unclipped) and #154 (`--spec` not canonicalized, read outside
  the checkout).

## A test fixture uses the default value, so it can't prove the configured one is read

- **Symptom:** tests pass when the code hardcodes the default (`origin`, the directory name) and
  ignores the config.
- **Cause:** the fixture's configured value equals the fallback, so both code paths give the same
  output.
- **Avoid:** in at least one test, set every configurable value to something different from its
  default and from every other source (e.g. remote `upstream`, project name not equal to the
  directory name). Seen twice in #154 (`git.remote`, `project`).
