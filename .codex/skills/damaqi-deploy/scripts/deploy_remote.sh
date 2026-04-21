#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  .codex/skills/damaqi-deploy/scripts/deploy_remote.sh \
    --host <host> \
    --password <password> \
    [--user root] \
    [--remote-dir /root/damaqi-web/current] \
    [--remote-home /root] \
    [--http-port 80] \
    [--socket-port 3011] \
    [--skip-tests]

Deploys the local build artifacts for this project to a remote Linux server over
password-based SSH and manages the runtime with pm2.
EOF
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

run_expect_command() {
  local command_string="$1"

  EXPECT_PASSWORD="$REMOTE_PASSWORD" \
  EXPECT_COMMAND="$command_string" \
    expect <<'EOF'
set timeout -1
set password $env(EXPECT_PASSWORD)
set command_string $env(EXPECT_COMMAND)
spawn bash -lc $command_string
expect {
  -re "(?i)are you sure you want to continue connecting" {
    send "yes\r"
    exp_continue
  }
  -re "(?i)password:" {
    send "$password\r"
    exp_continue
  }
  eof
}
catch wait result
exit [lindex $result 3]
EOF
}

REMOTE_HOST=""
REMOTE_PASSWORD=""
REMOTE_USER="root"
REMOTE_DIR="/root/damaqi-web/current"
REMOTE_HOME="/root"
HTTP_PORT="80"
SOCKET_PORT="3011"
RUN_TESTS="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      REMOTE_HOST="$2"
      shift 2
      ;;
    --password)
      REMOTE_PASSWORD="$2"
      shift 2
      ;;
    --user)
      REMOTE_USER="$2"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="$2"
      shift 2
      ;;
    --remote-home)
      REMOTE_HOME="$2"
      shift 2
      ;;
    --http-port)
      HTTP_PORT="$2"
      shift 2
      ;;
    --socket-port)
      SOCKET_PORT="$2"
      shift 2
      ;;
    --skip-tests)
      RUN_TESTS="0"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$REMOTE_HOST" || -z "$REMOTE_PASSWORD" ]]; then
  usage >&2
  exit 1
fi

if [[ -z "$REMOTE_DIR" || "$REMOTE_DIR" == "/" ]]; then
  echo "Refusing to deploy to an unsafe remote directory: $REMOTE_DIR" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../../../../" && pwd)"

require_command expect
require_command npm
require_command scp
require_command ssh
require_command tar

cd "$PROJECT_ROOT"

if [[ "$RUN_TESTS" == "1" ]]; then
  echo "Running test suite"
  npm run test:run
fi

echo "Building production artifacts"
npm run build

bundle_root="$(mktemp -d "${TMPDIR:-/tmp}/damaqi-deploy.XXXXXX")"
bundle_path="${bundle_root}/bundle.tar.gz"
trap 'rm -rf "$bundle_root"' EXIT

echo "Packaging deployment bundle"
tar -czf "$bundle_path" -C "$PROJECT_ROOT" dist dist-server ecosystem.config.cjs

remote_bundle="/tmp/damaqi-deploy.tar.gz"
scp_command="scp -o StrictHostKeyChecking=no $(printf '%q' "$bundle_path") $(printf '%q' "${REMOTE_USER}@${REMOTE_HOST}:${remote_bundle}")"

echo "Uploading bundle to ${REMOTE_USER}@${REMOTE_HOST}"
run_expect_command "$scp_command"

remote_dir_q="$(printf '%q' "$REMOTE_DIR")"
remote_home_q="$(printf '%q' "$REMOTE_HOME")"
remote_bundle_q="$(printf '%q' "$remote_bundle")"
http_port_q="$(printf '%q' "$HTTP_PORT")"
socket_port_q="$(printf '%q' "$SOCKET_PORT")"
remote_user_q="$(printf '%q' "$REMOTE_USER")"
ssh_target_q="$(printf '%q' "${REMOTE_USER}@${REMOTE_HOST}")"

read -r -d '' remote_script <<EOF || true
set -euo pipefail
remote_dir=${remote_dir_q}
remote_home=${remote_home_q}
bundle_path=${remote_bundle_q}
http_port=${http_port_q}
socket_port=${socket_port_q}
remote_user=${remote_user_q}

mkdir -p "\$remote_dir"
rm -rf "\$remote_dir/dist" "\$remote_dir/dist-server"
tar -xzf "\$bundle_path" -C "\$remote_dir"
rm -f "\$bundle_path"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

DAMAQI_DEPLOY_DIR="\$remote_dir" \
SOCKET_PORT="\$socket_port" \
PM2_SERVE_PORT="\$http_port" \
pm2 startOrReload "\$remote_dir/ecosystem.config.cjs" --update-env

pm2 save
pm2 startup systemd -u "\$remote_user" --hp "\$remote_home" >/dev/null
systemctl enable --now "pm2-\$remote_user" >/dev/null 2>&1 || true

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:\$http_port/" >/dev/null; then
    break
  fi
  if [[ "\$attempt" == "10" ]]; then
    echo "Frontend health check failed on port \$http_port" >&2
    exit 1
  fi
  sleep 1
done

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:\$socket_port/ws/?EIO=4&transport=polling" >/dev/null; then
    break
  fi
  if [[ "\$attempt" == "10" ]]; then
    echo "Socket health check failed on port \$socket_port" >&2
    exit 1
  fi
  sleep 1
done

pm2 status
EOF

remote_bash_command="bash --noprofile --norc -lc $(printf '%q' "$remote_script")"
ssh_command="ssh -o StrictHostKeyChecking=no ${ssh_target_q} $(printf '%q' "$remote_bash_command")"

echo "Deploying bundle on remote host"
run_expect_command "$ssh_command"

echo "Deployment finished"
echo "Frontend: http://${REMOTE_HOST}:${HTTP_PORT}/"
echo "Socket handshake: http://${REMOTE_HOST}:${SOCKET_PORT}/ws/?EIO=4&transport=polling"
