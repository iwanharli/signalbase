#!/usr/bin/env bash
# Deploy the pushed `main` branch to production.
#
#   ./deploy.sh                    host from .env.deploy (DEPLOY_HOST=user@host), not committed
#   DEPLOY_HOST=user@host ./deploy.sh
#
# On the server: /var/www/signalbase (git checkout), PM2 process `signalbase-3720`,
# nginx site signalbase.kecup.in. The server's .env is never touched.
set -euo pipefail

[ -f .env.deploy ] && . ./.env.deploy
HOST="${DEPLOY_HOST:?Set DEPLOY_HOST=user@host in .env.deploy or the environment}"
APP_DIR="/var/www/signalbase"
PROCESS="signalbase-3720"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes. Commit and push first." >&2
  exit 1
fi
git push -q origin main

# Zero-downtime build: the running app serves from one build folder ("slot") while the next build goes into the
# other, so pages never lose their CSS/JS mid-deploy. The app is only switched (restart with NEXT_DIST_DIR) once the
# new build is complete, and switched back if it does not answer. The previous slot stays for a quick rollback.
ssh "$HOST" "APP_DIR='$APP_DIR' PROCESS='$PROCESS' bash -s" <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"
git fetch -q origin main
git reset -q --hard origin/main
echo "▸ $(git log --oneline -1)"
npm ci --no-audit --no-fund --loglevel=error
npx prisma db push --skip-generate
npx prisma generate >/dev/null

active=$(cat .next-active 2>/dev/null || echo .next)
next=$([ "$active" = .next-a ] && echo .next-b || echo .next-a)
echo "▸ build → $next (live stays on $active)"
NODE_ENV=production NEXT_DIST_DIR="$next" npm run build

switch_to() {
  NEXT_DIST_DIR="$1" pm2 restart "$PROCESS" --update-env >/dev/null
  # AI categorisation worker: start it the first time, restart it afterwards.
  pm2 describe signalbase-classifier >/dev/null 2>&1 \
    && pm2 restart signalbase-classifier --update-env >/dev/null \
    || pm2 start npm --name signalbase-classifier --cwd "$APP_DIR" -- run classifier >/dev/null
}
healthy() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3720/login)" = 200 ] && return 0
    sleep 3
  done
  return 1
}

switch_to "$next"
if healthy; then
  echo "$next" > .next-active
  pm2 save >/dev/null
  # The very first switch leaves the old in-place build behind; it is no longer served.
  [ "$active" = .next ] && rm -rf .next
  echo "✔ Running on $next (login page 200)"
else
  echo "✘ New build did not answer; switching back to $active"
  pm2 logs "$PROCESS" --lines 30 --nostream || true
  switch_to "$active"
  healthy && echo "↺ Back on $active" || echo "✘ Previous build does not answer either"
  exit 1
fi
REMOTE
