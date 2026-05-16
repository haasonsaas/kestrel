#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${TEST_SRCDIR:-}" && -n "${TEST_WORKSPACE:-}" && -d "${TEST_SRCDIR}/${TEST_WORKSPACE}" ]]; then
  repo_root="${TEST_SRCDIR}/${TEST_WORKSPACE}"
elif git_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  repo_root="$git_root"
else
  repo_root="$(pwd)"
fi

fail() {
  echo "kestrel bazel contract: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "${repo_root}/${path}" ]] || fail "missing ${path}"
}

require_text() {
  local path="$1"
  local needle="$2"
  require_file "$path"
  grep -Fq "$needle" "${repo_root}/${path}" || fail "${path} must contain ${needle}"
}

require_file ".node-version"
require_file "package-lock.json"
require_file "Cargo.lock"
require_file "sdk/rust/kestrel-sdk/Cargo.toml"
require_file "sdk/js/package.json"
require_text "package.json" '"build": "electron-vite build"'
require_text "package.json" '"contextkit:build": "cd native/contextkit && swift build -c release"'
require_text "package.json" '"sdk:build"'
require_text "package.json" '"test": "node tests/contextkit-pipeline.test.mjs'
require_text ".github/workflows/ci.yml" "npm ci --ignore-scripts"
require_text ".github/workflows/ci.yml" "npm run build"
require_text ".github/workflows/ci.yml" "macos-14"
require_text ".github/workflows/ci.yml" "npm run contextkit:build"

echo "Kestrel Bazel contract matches the Electron, ContextKit, and SDK CI surface."
