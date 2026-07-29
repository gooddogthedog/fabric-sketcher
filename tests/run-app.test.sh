#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fabric-sketcher-runner-test.XXXXXX")"
STATE_DIR="$TEST_DIR/state"
BIN_DIR="$TEST_DIR/bin"

mkdir -p "$STATE_DIR" "$BIN_DIR"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

cat >"$BIN_DIR/vite" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >"$RUN_APP_TEST_STATE/vite-args"
trap 'touch "$RUN_APP_TEST_STATE/vite-stopped"; exit 0' INT TERM
while :; do sleep 1; done
EOF

cat >"$BIN_DIR/cloudflared" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >"$RUN_APP_TEST_STATE/cloudflared-args"
printf '%s\n' 'INF Your quick Tunnel has been created! Visit it at https://fabric-sketcher-test.trycloudflare.com'
trap 'touch "$RUN_APP_TEST_STATE/cloudflared-stopped"; exit 0' INT TERM
while :; do sleep 1; done
EOF

cat >"$BIN_DIR/lsof" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

cat >"$BIN_DIR/pgrep" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

cat >"$BIN_DIR/ipconfig" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

cat >"$BIN_DIR/ifconfig" <<'EOF'
#!/usr/bin/env bash
cat <<'OUTPUT'
lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST>
	inet 127.0.0.1 netmask 0xff000000
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST>
	inet 192.168.44.25 netmask 0xffffff00 broadcast 192.168.44.255
OUTPUT
EOF

chmod +x "$BIN_DIR"/*

RUN_APP_TEST_STATE="$STATE_DIR" \
FABRIC_SKETCHER_VITE_BIN="$BIN_DIR/vite" \
FABRIC_SKETCHER_CLOUDFLARED_BIN="$BIN_DIR/cloudflared" \
FABRIC_SKETCHER_LSOF_BIN="$BIN_DIR/lsof" \
FABRIC_SKETCHER_PGREP_BIN="$BIN_DIR/pgrep" \
FABRIC_SKETCHER_IPCONFIG_BIN="$BIN_DIR/ipconfig" \
FABRIC_SKETCHER_IFCONFIG_BIN="$BIN_DIR/ifconfig" \
  node --input-type=module - "$REPO_DIR/run-app.sh" "$STATE_DIR/output" <<'EOF'
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const [, , runnerPath, outputPath] = process.argv;
const runner = spawn('bash', [runnerPath], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';

for (const stream of [runner.stdout, runner.stderr]) {
  stream.on('data', (chunk) => {
    output += chunk.toString();
    appendFileSync(outputPath, chunk);
  });
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  const urlDeadline = Date.now() + 5000;
  while (
    !output.includes('https://fabric-sketcher-test.trycloudflare.com') &&
    Date.now() < urlDeadline
  ) {
    if (runner.exitCode !== null) {
      throw new Error(`runner exited before publishing its URLs\n${output}`);
    }
    await delay(25);
  }

  if (!output.includes('https://fabric-sketcher-test.trycloudflare.com')) {
    throw new Error(`runner did not publish its URLs\n${output}`);
  }

  runner.kill('SIGINT');

  const result = await Promise.race([
    new Promise((resolve) => {
      runner.once('close', (code, signal) => resolve({ code, signal }));
    }),
    delay(5000).then(() => ({ timeout: true })),
  ]);

  if (result.timeout) {
    throw new Error('runner did not exit after SIGINT');
  }
  if (result.code !== 130 || result.signal !== null) {
    throw new Error(
      `expected SIGINT exit status 130, got code=${result.code} signal=${result.signal}`,
    );
  }
} finally {
  if (runner.exitCode === null) {
    runner.kill('SIGTERM');
  }
}
EOF

grep -q -- '--host 0.0.0.0 --port 9090 --strictPort' "$STATE_DIR/vite-args"
grep -q -- 'tunnel --url http://localhost:9090 --no-autoupdate' "$STATE_DIR/cloudflared-args"
grep -q 'Local network: http://192.168.44.25:9090/' "$STATE_DIR/output"
grep -q 'Public tunnel: https://fabric-sketcher-test.trycloudflare.com' "$STATE_DIR/output"

test -f "$STATE_DIR/vite-stopped"
test -f "$STATE_DIR/cloudflared-stopped"

printf '%s\n' 'PASS: run-app.sh launches, reports URLs, and cleans up both child processes'
