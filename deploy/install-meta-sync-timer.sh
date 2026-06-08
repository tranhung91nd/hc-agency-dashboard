#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/hc-agency-dashboard/current}"
ENV_FILE="${ENV_FILE:-/etc/hc-agency-dashboard.env}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "APP_DIR not found: $APP_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Warning: $ENV_FILE not found. The service needs LOCAL_DB_URL, LOCAL_DB_JWT_SECRET, LOCAL_DB_SERVICE_KEY, and META_TOKEN." >&2
fi

install -m 0644 "$APP_DIR/deploy/systemd/hc-meta-sync.service" /etc/systemd/system/hc-meta-sync.service
install -m 0644 "$APP_DIR/deploy/systemd/hc-meta-sync.timer" /etc/systemd/system/hc-meta-sync.timer

systemctl daemon-reload
systemctl enable --now hc-meta-sync.timer
systemctl list-timers hc-meta-sync.timer --no-pager
