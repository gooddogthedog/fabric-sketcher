# Run App Launcher Design

`run-app.sh` is a macOS-oriented, repository-root launcher for Fabric Sketcher. It runs Vite on `0.0.0.0:9090`, starts a Cloudflare quick tunnel to `http://localhost:9090`, prints the first usable private-network IPv4 URL, and prints the generated `trycloudflare.com` URL when Cloudflare reports it.

Before launch, it terminates only existing listeners on port 9090 and stale Fabric Sketcher Vite or Cloudflare processes rooted in this checkout. It validates required commands, stores transient logs under a temporary directory, and traps `INT`, `TERM`, and `EXIT` so Ctrl-C stops both child processes and removes temporary files. If either child exits unexpectedly, the launcher exits and cleans up the other.

The behavior is verified with a shell integration test using temporary command doubles, plus `bash -n` and the existing `pnpm quality` gate.
