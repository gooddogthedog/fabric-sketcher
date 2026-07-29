#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=9090
VITE_BIN="${FABRIC_SKETCHER_VITE_BIN:-$APP_DIR/node_modules/.bin/vite}"
CLOUDFLARED_BIN="${FABRIC_SKETCHER_CLOUDFLARED_BIN:-$(command -v cloudflared || true)}"
LSOF_BIN="${FABRIC_SKETCHER_LSOF_BIN:-$(command -v lsof || true)}"
PGREP_BIN="${FABRIC_SKETCHER_PGREP_BIN:-$(command -v pgrep || true)}"
IPCONFIG_BIN="${FABRIC_SKETCHER_IPCONFIG_BIN:-$(command -v ipconfig || true)}"
IFCONFIG_BIN="${FABRIC_SKETCHER_IFCONFIG_BIN:-$(command -v ifconfig || true)}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fabric-sketcher-run.XXXXXX")"
VITE_LOG="$RUN_DIR/vite.log"
TUNNEL_LOG="$RUN_DIR/cloudflared.log"
APP_PID=""
TUNNEL_PID=""

require_executable() {
  local executable="$1"
  local install_hint="$2"

  if [[ -z "$executable" || ! -x "$executable" ]]; then
    printf 'Missing required command: %s\n' "$install_hint" >&2
    exit 1
  fi
}

stop_pids() {
  local pids="$1"
  local pid
  local remaining=""

  [[ -z "$pids" ]] && return

  kill $pids 2>/dev/null || true

  for _ in {1..20}; do
    remaining=""
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        remaining="$remaining $pid"
      fi
    done
    [[ -z "$remaining" ]] && return
    sleep 0.1
  done

  kill -KILL $remaining 2>/dev/null || true
}

cleanup() {
  local status=$?

  trap - EXIT INT TERM
  stop_pids "$TUNNEL_PID"
  stop_pids "$APP_PID"
  rm -rf -- "$RUN_DIR"
  exit "$status"
}

handle_interrupt() {
  exit 130
}

handle_termination() {
  exit 143
}

find_lan_ip() {
  local interface
  local address

  if [[ -n "$IPCONFIG_BIN" && -x "$IPCONFIG_BIN" ]]; then
    for interface in en0 en1 en2 bridge0 bridge100; do
      address="$("$IPCONFIG_BIN" getifaddr "$interface" 2>/dev/null || true)"
      if [[ -n "$address" && "$address" != 127.* && "$address" != 169.254.* ]]; then
        printf '%s\n' "$address"
        return
      fi
    done
  fi

  if [[ -n "$IFCONFIG_BIN" && -x "$IFCONFIG_BIN" ]]; then
    "$IFCONFIG_BIN" | awk '
      $1 == "inet" && ($2 ~ /^10\./ || $2 ~ /^192\.168\./ || $2 ~ /^172\.(1[6-9]|2[0-9]|3[01])\./) {
        print $2
        exit
      }
    '
  fi
}

trap cleanup EXIT
trap handle_interrupt INT
trap handle_termination TERM

require_executable "$VITE_BIN" "$APP_DIR/node_modules/.bin/vite (run pnpm install)"
require_executable "$CLOUDFLARED_BIN" "cloudflared (run brew install cloudflared)"
require_executable "$LSOF_BIN" "lsof"
require_executable "$PGREP_BIN" "pgrep"

existing_listener_pids="$("$LSOF_BIN" -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
existing_tunnel_pids="$(
  "$PGREP_BIN" -f "cloudflared.*tunnel.*--url.*http://(localhost|127\\.0\\.0\\.1):$PORT" 2>/dev/null || true
)"

if [[ -n "$existing_listener_pids" || -n "$existing_tunnel_pids" ]]; then
  printf '%s\n' "Stopping the existing Fabric Sketcher session on port $PORT..."
  stop_pids "$existing_tunnel_pids"
  stop_pids "$existing_listener_pids"
fi

cd "$APP_DIR"

"$VITE_BIN" --host 0.0.0.0 --port "$PORT" --strictPort >"$VITE_LOG" 2>&1 &
APP_PID=$!

sleep 0.25
if ! kill -0 "$APP_PID" 2>/dev/null; then
  printf '%s\n' 'Fabric Sketcher failed to start:' >&2
  sed 's/^/  /' "$VITE_LOG" >&2
  exit 1
fi

lan_ip="$(find_lan_ip)"
if [[ -n "$lan_ip" ]]; then
  printf 'Local network: http://%s:%s/\n' "$lan_ip" "$PORT"
else
  printf 'Local network: unavailable (local Mac: http://localhost:%s/)\n' "$PORT"
fi

"$CLOUDFLARED_BIN" tunnel \
  --url "http://localhost:$PORT" \
  --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

tunnel_url=""
for _ in {1..300}; do
  tunnel_url="$(
    grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null |
      head -n 1 || true
  )"

  if [[ -n "$tunnel_url" ]]; then
    break
  fi

  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    printf '%s\n' 'Cloudflare tunnel failed to start:' >&2
    sed 's/^/  /' "$TUNNEL_LOG" >&2
    exit 1
  fi

  sleep 0.1
done

if [[ -z "$tunnel_url" ]]; then
  printf '%s\n' 'Cloudflare did not publish a tunnel URL within 30 seconds:' >&2
  sed 's/^/  /' "$TUNNEL_LOG" >&2
  exit 1
fi

printf 'Public tunnel: %s\n' "$tunnel_url"
printf '%s\n' 'Press Ctrl-C to stop Fabric Sketcher and the tunnel.'

while :; do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    printf '%s\n' 'Fabric Sketcher stopped unexpectedly:' >&2
    sed 's/^/  /' "$VITE_LOG" >&2
    exit 1
  fi

  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    printf '%s\n' 'Cloudflare tunnel stopped unexpectedly:' >&2
    sed 's/^/  /' "$TUNNEL_LOG" >&2
    exit 1
  fi

  sleep 1
done
