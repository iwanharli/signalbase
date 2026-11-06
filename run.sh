#!/usr/bin/env bash
# Menyiapkan dan menjalankan Signalbase dalam satu perintah.
#
#   ./run.sh           mode pengembangan (http://localhost:3100)
#   ./run.sh prod      build lalu jalankan mode produksi
#
# Port bisa diganti: PORT=4100 ./run.sh

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3100}"
MODE="${1:-dev}"

info() { printf "\033[1;35m▸\033[0m %s\n" "$1"; }
ok()   { printf "\033[1;32m✔\033[0m %s\n" "$1"; }
fail() { printf "\033[1;31m✘\033[0m %s\n" "$1" >&2; exit 1; }

command -v node >/dev/null || fail "Node.js belum terpasang (butuh versi 18.18 atau lebih baru)."
command -v psql >/dev/null || fail "psql tidak ditemukan. Pasang PostgreSQL atau Postgres.app dan tambahkan ke PATH."

pid="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
[ -z "$pid" ] || fail "Port $PORT sudah dipakai (PID $pid). Hentikan prosesnya atau pakai port lain: PORT=4100 ./run.sh"

# 1. File .env: dibuat otomatis dengan secret acak bila belum ada.
if [ ! -f .env ]; then
  info "Membuat .env"
  ADMIN_PASSWORD="$(node -e 'console.log(require("crypto").randomBytes(6).toString("base64url"))')"
  cat > .env <<ENV
DATABASE_URL="postgresql://$(whoami)@localhost:5432/signalbase"
SOURCE_DATABASE_URL=""
AUTH_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="$ADMIN_PASSWORD"
ENV
  ok ".env dibuat. Login admin: admin / $ADMIN_PASSWORD"
fi

set -a; source .env; set +a
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL kosong di .env"
[ -n "${SOURCE_DATABASE_URL:-}" ] || fail "SOURCE_DATABASE_URL kosong di .env (sumber data media)."

# 2. Database: pastikan server hidup dan database ada.
DB_NAME="$(node -e 'console.log(new URL(process.env.DATABASE_URL).pathname.slice(1))')"
SERVER_URL="$(node -e 'const u=new URL(process.env.DATABASE_URL); u.pathname="/postgres"; console.log(u.toString())')"
psql "$SERVER_URL" -c "select 1" >/dev/null 2>&1 || fail "Tidak bisa terhubung ke PostgreSQL. Pastikan server berjalan dan DATABASE_URL benar."
if ! psql "$SERVER_URL" -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
  info "Membuat database $DB_NAME"
  psql "$SERVER_URL" -c "create database \"$DB_NAME\"" >/dev/null
fi
ok "Database $DB_NAME siap"

# 3. Dependensi: install ulang hanya bila package-lock berubah.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  info "Memasang dependensi"
  npm install --no-audit --no-fund
fi

# 4. Skema & admin awal (aman dijalankan berulang).
info "Menyinkronkan skema database"
npx prisma db push --skip-generate >/dev/null 2>&1 || npx prisma db push --skip-generate
npx prisma generate >/dev/null 2>&1
npm run --silent db:seed

case "$MODE" in
  dev)
    ok "Membuka http://localhost:$PORT  (login: $ADMIN_USERNAME, kata sandi di .env)"
    exec npx next dev --turbopack -p "$PORT"
    ;;
  prod)
    info "Build produksi"
    npm run build
    ok "Membuka http://localhost:$PORT"
    exec npx next start -p "$PORT"
    ;;
  *)
    fail "Mode tidak dikenal: $MODE (pilih: dev, prod)"
    ;;
esac
