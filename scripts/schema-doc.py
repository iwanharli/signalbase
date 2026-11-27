"""Writes docs/SCHEMA.md from the local database (structure only) and the comments in prisma/schema.prisma.

    npm run db:doc          # reads DATABASE_URL from .env

Run it after `prisma db push` whenever the schema changes, so the file matches the tables.
"""
import datetime
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


def env_url():
    for line in open(os.path.join(ROOT, ".env")):
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').split("?")[0]
    raise SystemExit("DATABASE_URL is not in .env")


def query(url, sql):
    out = subprocess.check_output(["psql", url, "-AtF", "\t", "-c", sql], text=True)
    return [line.split("\t") for line in out.splitlines() if line]


def prisma_comments():
    """{model: (model comment, {field: comment})} from the /// and // comments in schema.prisma."""
    text = open(os.path.join(ROOT, "prisma", "schema.prisma")).read()
    models, pending = {}, []
    current = None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("//"):
            pending.append(s.lstrip("/").strip())
            continue
        m = re.match(r"model (\w+) \{", s)
        if m:
            current = m.group(1)
            models[current] = (" ".join(pending), {})
            pending = []
            continue
        if s == "}":
            current, pending = None, []
            continue
        m = re.match(r"(\w+)\s+\S+(.*)", s)
        if current and m and not s.startswith("@@"):
            inline = m.group(2).split("//", 1)[1].strip() if "//" in m.group(2) else ""
            models[current][1][m.group(1)] = " ".join(pending + ([inline] if inline else []))
        pending = []
    return models


def main():
    url = env_url()
    comments = prisma_comments()
    tables = [r[0] for r in query(url, "select table_name from information_schema.tables where table_schema = 'public' "
                                       "and table_type = 'BASE TABLE' and table_name <> '_prisma_migrations' order by 1")]
    today = datetime.date.today()
    out = [
        f"# Schema database `{url.rsplit('/', 1)[1]}`",
        "",
        f"Dibuat {today.day} {MONTHS[today.month - 1]} {today.year} dengan `npm run db:doc` dari database lokal, yang sama dengan "
        "`prisma/schema.prisma`.",
        "",
        "- Sumber kebenaran tetap `prisma/schema.prisma`; berkas ini bacaan, buat ulang bila schema berubah.",
        "- Perubahan diterapkan dengan `prisma db push` (tanpa folder migrations). Perubahan yang tidak bisa lewat `db push` "
        "(ganti nama, kunci utama) ada di `prisma/sql/`, dijalankan `deploy.sh` sebelum `db push`.",
        "- Hanya struktur, tanpa data. Berkas ini **bukan backup**: untuk itu tetap perlu `pg_dump`.",
        "- Database sumber (media sosial dan berita) tidak termasuk; aplikasi hanya membacanya.",
        "- Keterangan diambil dari komentar di `schema.prisma`.",
        "",
        f"## Daftar tabel ({len(tables)})",
        "",
        *[f"- [{t}](#{t.lower()})" for t in tables],
    ]
    for t in tables:
        model_comment, field_comments = comments.get(t, ("", {}))
        cols = query(url, f"select column_name, format_type(a.atttypid, a.atttypmod), is_nullable, coalesce(column_default, '') "
                          f"from information_schema.columns c join pg_attribute a on a.attrelid = '\"{t}\"'::regclass "
                          f"and a.attname = c.column_name where table_schema = 'public' and table_name = '{t}' order by ordinal_position")
        cons = query(url, f"select pg_get_constraintdef(oid) from pg_constraint where conrelid = '\"{t}\"'::regclass and contype <> 'n' order by 1")
        idx = query(url, f"select indexdef from pg_indexes where schemaname = 'public' and tablename = '{t}' "
                         f"and indexname not in (select conname from pg_constraint where conrelid = '\"{t}\"'::regclass) order by 1")
        out += ["", f"## {t}", ""]
        if model_comment:
            out += [model_comment, ""]
        out += ["| Kolom | Tipe | Wajib | Default | Keterangan |", "|---|---|---|---|---|"]
        for name, typ, nullable, default in cols:
            note = field_comments.get(name, "").replace("|", "\\|")
            out.append(f"| `{name}` | {typ} | {'tidak' if nullable == 'YES' else 'ya'} | {f'`{default}`' if default else ''} | {note} |")
        if cons:
            out += ["", "**Kunci:**", *[f"- `{c[0]}`" for c in cons]]
        if idx:
            out += ["", "**Index:**", *[f"- `{i[0].replace('public.', '')}`" for i in idx]]
    open(os.path.join(ROOT, "docs", "SCHEMA.md"), "w").write("\n".join(out) + "\n")
    print(f"docs/SCHEMA.md: {len(tables)} tables")


if __name__ == "__main__":
    main()
