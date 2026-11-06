#!/usr/bin/env bash
# The baton fixture plus a Rust crate that already depends on tokio.
set -euo pipefail
bash "$(dirname "$0")/../_fixtures/baton-repo.sh"
mkdir -p worker/src
cat > worker/Cargo.toml <<'TOML'
[package]
name = "worker"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.38", features = ["rt-multi-thread", "macros", "sync"] }
TOML
cat > worker/src/main.rs <<'RS'
#[tokio::main]
async fn main() {
    let (tx, _rx) = tokio::sync::broadcast::channel::<u32>(16);
    drop(tx);
}
RS
git add -A
git commit -q -m "Add the worker crate"
