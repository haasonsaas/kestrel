#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-evalops-dev}"
ZONE="${ZONE:-us-central1-a}"
INSTANCE="${INSTANCE:-bazel-rbe-dev-buildfarm}"
LOCAL_PORT="${LOCAL_PORT:-8980}"
REMOTE_PORT="${REMOTE_PORT:-8980}"
CONFIG="${CONFIG:-remote-gcp-dev}"
USE_EXISTING_TUNNEL="${BAZEL_RBE_USE_EXISTING_TUNNEL:-false}"

if [[ $# -eq 0 ]]; then
  if [[ -n "${BAZEL_TARGETS:-}" ]]; then
    read -r -a bazel_targets <<< "${BAZEL_TARGETS}"
    set -- test "${bazel_targets[@]}"
  else
    set -- test //...
  fi
fi

if [[ "${USE_EXISTING_TUNNEL}" == "true" ]]; then
  tunnel_pid=""
elif pgrep -f "gcloud compute start-iap-tunnel ${INSTANCE} ${REMOTE_PORT}.*--local-host-port=localhost:${LOCAL_PORT}" >/dev/null; then
  tunnel_pid=""
else
  gcloud compute start-iap-tunnel "${INSTANCE}" "${REMOTE_PORT}" \
    --project "${PROJECT_ID}" \
    --zone "${ZONE}" \
    --local-host-port="localhost:${LOCAL_PORT}" \
    >/tmp/kestrel-bazel-rbe-tunnel.log 2>&1 &
  tunnel_pid="$!"
  sleep 2
fi

cleanup() {
  if [[ -n "${tunnel_pid:-}" ]]; then
    kill "${tunnel_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

bazelisk "$@" "--config=${CONFIG}"
