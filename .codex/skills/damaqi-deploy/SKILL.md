---
name: damaqi-deploy
description: >
  Use when the user wants to deploy, redeploy, update, or inspect deployment
  state for this Damaqi Vite + React + Socket.IO project on a Linux server over
  SSH with pm2. Handles local build/test, uploads `dist/`, `dist-server/`, and
  `ecosystem.config.cjs`, installs pm2 if missing, starts or reloads the
  `damaqi-client` and `damaqi-socket` processes, enables pm2 startup, and
  verifies HTTP plus Socket.IO health. Also use for requests like "部署",
  "上线", "发版", "更新服务器", or pm2 status/log checks for this repo.
---

# Damaqi Deploy

This project ships as two runtime pieces:

- `dist/`: Vite client, served by `pm2 serve`
- `dist-server/index.cjs`: Socket.IO backend, started by Node under pm2

The canonical pm2 config is [ecosystem.config.cjs](../../../../ecosystem.config.cjs). The default deployment shape is:

- frontend: `damaqi-client` on port `80`
- socket server: `damaqi-socket` on port `3011`
- socket path: `/ws`
- default remote dir: `/root/damaqi-web/current`

## When to use

Use this skill when the user wants any of the following for this repository:

- first deployment to a Linux server
- repeat deployment after code changes
- pm2 status or log inspection
- deployment troubleshooting around ports `80` and `3011`

## Required inputs

Collect these before deploying:

- SSH host
- SSH password
- SSH user, default `root`

Optional overrides:

- remote deployment dir
- public HTTP port, default `80`
- socket port, default `3011`
- whether to skip test execution before deployment

## Project-specific notes

- The client computes its socket URL from the current page hostname plus `VITE_SOCKET_PORT` or the default `3011`.
- If the deployment will proxy sockets behind another domain or path, rebuild with `VITE_SOCKET_URL` before running the deployment script.
- External access still depends on cloud security groups or firewall rules opening TCP `80` and `3011`.

## Workflow

1. Re-read [package.json](../../../../package.json), [src/server/index.ts](../../../../src/server/index.ts), [src/multiplayer/socket.ts](../../../../src/multiplayer/socket.ts), and [ecosystem.config.cjs](../../../../ecosystem.config.cjs) if deployment assumptions may have changed.
2. Run the deployment script from the repo root:

```bash
bash .codex/skills/damaqi-deploy/scripts/deploy_remote.sh \
  --host 8.137.60.44 \
  --password 'your-password' \
  --user root
```

3. For a non-default target, pass overrides such as `--remote-dir`, `--http-port`, `--socket-port`, or `--skip-tests`.
4. After deployment, inspect the remote process state with:

```bash
ssh root@HOST
pm2 status
pm2 logs damaqi-client
pm2 logs damaqi-socket
```

## Script behavior

[`deploy_remote.sh`](./scripts/deploy_remote.sh) performs the full deployment flow:

1. validates required local tools
2. runs local build and, unless skipped, tests
3. packages `dist/`, `dist-server/`, and `ecosystem.config.cjs`
4. uploads the bundle over password-based SSH
5. installs `pm2` remotely if missing
6. extracts into the remote deployment directory
7. runs `pm2 startOrReload ecosystem.config.cjs --update-env`
8. saves pm2 state and enables pm2 startup
9. verifies `http://127.0.0.1:<http-port>/`
10. verifies `http://127.0.0.1:<socket-port>/ws/?EIO=4&transport=polling`

## Troubleshooting

- Empty or missing public responses with healthy local checks usually indicate cloud security group or firewall issues, not an app crash.
- If the frontend is reachable but multiplayer fails, check whether port `3011` is exposed or reverse-proxied.
- If pm2 restarts repeatedly, inspect `pm2 logs damaqi-socket` first.
