#!/usr/bin/env bash
# Read-only checks on the production server, for troubleshooting without a free-form shell.
# Only the commands below exist; every argument is validated locally before anything is sent.
# Nothing here changes files, processes or data on the server.
#
#   scripts/prod.sh status                 PM2 status of Signalbase and KIPERMAS, deployed commit, server load
#   scripts/prod.sh logs <app> [lines]     last error/output log lines; app = signalbase | classifier | kipermas (lines ≤ 200)
#   scripts/prod.sh db                     read-only SQL on the Signalbase app database, query read from stdin
#   scripts/prod.sh egress                 the server's outgoing IPv4/IPv6 addresses (what API access rules see)
#   scripts/prod.sh api-check              KIPERMAS → Signalbase API call with KIPERMAS's own key; prints only status and totals
#
# Host comes from the gitignored .env.deploy (DEPLOY_HOST=user@host), same as deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.deploy ] && set -a && . ./.env.deploy && set +a
HOST="${DEPLOY_HOST:?Set DEPLOY_HOST=user@host in .env.deploy}"
remote() { ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 "$HOST" "bash -s" -- "$@"; }

case "${1:-}" in
  status)
    remote <<'REMOTE'
pm2 jlist | python3 -c '
import json, sys, time
for p in json.load(sys.stdin):
    if p["name"].startswith(("signalbase", "swp")):
        e = p["pm2_env"]
        uptime_min = int((time.time() * 1000 - e["pm_uptime"]) / 60000)
        print("%-24s %-8s uptime %d min  restarts %d" % (p["name"], e["status"], uptime_min, e["restart_time"]))'
echo "signalbase commit: $(git -C /var/www/signalbase log --oneline -1)"
echo "signalbase build:  $(date -r /var/www/signalbase/.next/BUILD_ID '+%Y-%m-%d %H:%M' 2>/dev/null || echo none)"
uptime
REMOTE
    ;;

  logs)
    app="${2:-}"; lines="${3:-60}"
    case "$app" in
      signalbase) proc=signalbase-3720 ;;
      classifier) proc=signalbase-classifier ;;
      kipermas) proc=swp-3700 ;;
      *) echo "app harus signalbase, classifier, atau kipermas" >&2; exit 2 ;;
    esac
    [[ "$lines" =~ ^[0-9]+$ ]] && [ "$lines" -le 200 ] || { echo "lines harus angka ≤ 200" >&2; exit 2; }
    remote "$proc" "$lines" <<'REMOTE'
echo "== $1 errors"; pm2 logs "$1" --err --lines "$2" --nostream 2>/dev/null | tail -n "$2" | cut -c1-300
echo "== $1 output"; pm2 logs "$1" --out --lines "$2" --nostream 2>/dev/null | tail -n "$2" | cut -c1-300
REMOTE
    ;;

  db)
    # The query comes from stdin and runs inside a READ ONLY transaction, so writes fail.
    sql="$(cat)"
    [ -n "$sql" ] || { echo "kirim query lewat stdin, mis.: echo 'select 1' | scripts/prod.sh db" >&2; exit 2; }
    # The remote script itself arrives on stdin, so the query travels as an argument (base64: no quoting issues).
    encoded="$(printf '%s' "$sql" | base64 | tr -d '\n')"
    remote "$encoded" <<'REMOTE'
cd /var/www/signalbase
url=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d "\"'" | sed 's/?schema=[a-z]*//')
{ echo "BEGIN READ ONLY;"; echo "$1" | base64 -d; echo ";"; echo "ROLLBACK;"; } \
  | PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000' psql "$url" -X -q -v ON_ERROR_STOP=1 -P pager=off
REMOTE
    ;;

  egress)
    remote <<'REMOTE'
echo "ipv4:    $(curl -s -4 -m 10 https://api.ipify.org || echo none)"
echo "ipv6:    $(curl -s -6 -m 10 https://api64.ipify.org || echo none)"
echo "default: $(curl -s -m 10 https://api64.ipify.org || echo none)"
REMOTE
    ;;

  api-check)
    # Uses KIPERMAS's own key from its .env on the server; the key is never printed or sent anywhere else.
    remote <<'REMOTE'
cd /var/www/swp
url=$(grep -E '^SIGNALBASE_URL=' .env | cut -d= -f2- | tr -d "\"'"); key=$(grep -E '^SIGNALBASE_API_KEY=' .env | cut -d= -f2- | tr -d "\"'")
[ -n "$url" ] && [ -n "$key" ] || { echo "SIGNALBASE_URL atau SIGNALBASE_API_KEY tidak ada di .env KIPERMAS"; exit 1; }
for path in "media/social?size=1" "media/online?size=1"; do
  for fam in 4 6; do
    body=$(curl -s -"$fam" -m 30 -H "x-api-key: $key" -w '\n%{http_code}' "${url%/}/api/v1/$path" || true)
    code=$(echo "$body" | tail -1)
    info=$(echo "$body" | head -n -1 | grep -o '"total":[0-9]*\|"error":"[^"]*"' | head -1)
    echo "$path ipv$fam: HTTP $code $info"
  done
done
REMOTE
    ;;

  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
