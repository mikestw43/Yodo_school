#!/usr/bin/env bash
# Pull the latest code and rebuild/restart the container, but only when
# something changed (or with --force). Safe to run every 5 minutes.
# Used on both the Synology NAS (Task Scheduler) and the droplet (cron).
set -uo pipefail

APP_DIR="${YODO_APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

# git reset below may rewrite this very file while bash is still reading
# it, so run from a private copy.
if [ -z "${YODO_APP_DIR:-}" ]; then
  COPY="$(mktemp /tmp/yodo-update.XXXXXX)"
  cp "$0" "$COPY"
  YODO_APP_DIR="$APP_DIR" exec bash "$COPY" "$@"
fi
trap 'rm -f "$0"' EXIT
cd "$APP_DIR" || exit 1
LOG="$APP_DIR/deploy/update.log"
LOCK="/tmp/yodo-update.lock"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }
# Keep the log small.
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ] && tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

# One run at a time (mkdir is atomic and exists everywhere, unlike flock).
if ! mkdir "$LOCK" 2>/dev/null; then
  # Clear a lock left behind by a crashed run (older than 30 minutes).
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then rmdir "$LOCK"; mkdir "$LOCK" || exit 0; else exit 0; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null; rm -f "$0"' EXIT

[ -f .env ] && set -a && . ./.env && set +a
BRANCH="${BRANCH:-main}"
PORT="${PORT:-8092}"

if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else log "ERROR: docker compose not found"; exit 1; fi

if ! git fetch -q origin "$BRANCH"; then log "ERROR: git fetch failed (network or deploy key)"; exit 1; fi
# Compare with the last version that deployed successfully (not just the
# checked-out commit), so a failed build is retried on the next run.
DEPLOYED="$(cat deploy/.deployed 2>/dev/null || true)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
if [ "$DEPLOYED" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then exit 0; fi

log "updating ${DEPLOYED:0:7} -> ${REMOTE:0:7}"
git reset -q --hard "origin/$BRANCH"
VERSION="$(git rev-parse --short HEAD)"
echo "$VERSION $(git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M')" > web/version.txt

# A failed build must be loud: the old container keeps running, so the
# site would otherwise look fine while serving stale code.
if ! $DC build >>"$LOG" 2>&1; then
  log "ERROR: build failed for $VERSION - the previous version is still running"
  exit 1
fi
# Docker on Synology will not create a missing bind-mount folder, so make
# sure the data folder exists (relative paths are relative to this repo).
DATA="${DATA_DIR:-../data}"
case "$DATA" in /*) ;; *) DATA="$APP_DIR/$DATA" ;; esac
mkdir -p "$DATA"

if ! $DC up -d >>"$LOG" 2>&1; then
  log "ERROR: could not start container for $VERSION"
  exit 1
fi

# Confirm the running site really serves the new version.
for _ in $(seq 1 60); do  # first start runs the schema update, allow up to 2 minutes
  if curl -fsS "http://127.0.0.1:${PORT}/version.txt" 2>/dev/null | grep -q "^$VERSION "; then
    log "OK: now serving $VERSION"
    git rev-parse HEAD > deploy/.deployed
    exit 0
  fi
  sleep 2
done
log "ERROR: container started but does not serve $VERSION on port $PORT"
exit 1
