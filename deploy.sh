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

ssh "$HOST" "APP_DIR='$APP_DIR' PROCESS='$PROCESS' bash -s" <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"
git fetch -q origin main
git reset -q --hard origin/main
echo "▸ $(git log --oneline -1)"
npm ci --no-audit --no-fund --loglevel=error
npx prisma db push --skip-generate
npx prisma generate >/dev/null
NODE_ENV=production npm run build
pm2 restart "$PROCESS" --update-env >/dev/null
# AI categorisation worker: start it the first time, restart it afterwards.
pm2 describe signalbase-classifier >/dev/null 2>&1 \
  && pm2 restart signalbase-classifier --update-env >/dev/null \
  || pm2 start npm --name signalbase-classifier --cwd "$APP_DIR" -- run classifier >/dev/null
pm2 save >/dev/null
sleep 3
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3720/login)
[ "$code" = 200 ] && echo "✔ Running (login page $code)" || { echo "✘ Login page returned $code"; pm2 logs "$PROCESS" --lines 30 --nostream; exit 1; }
REMOTE
