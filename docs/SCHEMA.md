# Schema database `db_signalbase`

Dibuat 26 November 2026 dari database **lokal**, yang saat itu sama dengan `prisma/schema.prisma`. Database produksi belum diperiksa.

- Sumber kebenaran tetap `prisma/schema.prisma`; berkas ini cadangan bacaan, perbarui bila schema berubah.
- Perubahan diterapkan dengan `prisma db push` (tanpa folder migrations). Pengecualian: kunci utama `ItemLabel`, lewat `docs/sql/2026-11-26-itemlabel-multi.sql`.
- Hanya struktur, tanpa data. Berkas ini **bukan backup**: untuk itu tetap perlu `pg_dump`.
- Database sumber (media sosial dan berita) tidak termasuk; aplikasi hanya membacanya.
- Keterangan diambil dari komentar di `schema.prisma` (sebagian berbahasa Inggris). “Proyek” di panel = tabel `ApiKey`.

## Daftar tabel (25)

- [Admin](#admin)
- [AiCredit](#aicredit)
- [AiSetting](#aisetting)
- [AiSummary](#aisummary)
- [AiUsageLog](#aiusagelog)
- [ApiKey](#apikey)
- [ApiKeyUsage](#apikeyusage)
- [ArchivedReport](#archivedreport)
- [BalanceSnapshot](#balancesnapshot)
- [Classification](#classification)
- [Classifier](#classifier)
- [ContactRequest](#contactrequest)
- [Invoice](#invoice)
- [ItemLabel](#itemlabel)
- [LabelAi](#labelai)
- [LabelAiItem](#labelaiitem)
- [LabelAiUsage](#labelaiusage)
- [MediaAsset](#mediaasset)
- [MediaCursor](#mediacursor)
- [MediaLink](#medialink)
- [MediaProjectSync](#mediaprojectsync)
- [MediaWorkerState](#mediaworkerstate)
- [ProjectMember](#projectmember)
- [ReportProfile](#reportprofile)
- [TokenUsage](#tokenusage)

## Admin

Panel account. role "admin" manages everything; role "user" signs up, waits for an admin to approve, then manages only their own API keys.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `username` | text | ya |  |  |
| `name` | text | ya |  |  |
| `passwordHash` | text | ya |  |  |
| `role` | text | ya | `'admin'::text` | "admin" \| "user" |
| `status` | text | ya | `'active'::text` | "pending" (signed up, waiting for an admin) \| "active" \| "suspended" |
| `plan` | text | tidak |  | Plan of a "user" account: trial \| starter \| pro \| instansi. null = no plan limits (accounts set up by hand). |
| `planExpiresAt` | timestamp(3) without time zone | tidak |  | End of the trial or paid period; keys stop working after it. null = no end date. |
| `requestedPlan` | text | tidak |  | Plan chosen on /pricing when signing up (?plan=), shown to the admin who approves; it does not grant anything. |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |
| `demo` | boolean | ya | `false` | Sub-account of a client: set for extra logins of one client. It follows the parent's plan, period and status, owns no projects and only sees the parent's projects an admin shared with it (ProjectMember). null = a main account. Demo account (e.g. a pilot for a prospective client): no "Paket & tagihan" menu, plan chip or plan banners. Sub-accounts follow their main account's flag. |
| `parentId` | text | tidak |  |  |

**Kunci:**
- `FOREIGN KEY ("parentId") REFERENCES "Admin"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY (id)`

**Index:**
- `CREATE UNIQUE INDEX "Admin_username_key" ON "Admin" USING btree (username)`

## AiCredit

Extra Signalbase AI posts bought for one month (paid top-up invoices), on top of the plan's monthly quota.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `accountId` | text | ya |  |  |
| `month` | text | ya |  | YYYY-MM, Asia/Jakarta |
| `posts` | integer | ya | `0` |  |

**Kunci:**
- `PRIMARY KEY ("accountId", month)`

## AiSetting

Platform AI settings (one row, id "global"): the provider behind Ringkasan AI, its schedule, and token prices for cost tracking.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya | `'global'::text` |  |
| `providerKind` | text | ya | `'openai_compatible'::text` | "anthropic" \| "openai_compatible" |
| `providerBaseUrl` | text | tidak |  |  |
| `providerModel` | text | ya |  |  |
| `providerKeyEnc` | text | ya |  | AES-256-GCM, see lib/server/secrets.ts |
| `providerKeyHint` | text | ya |  | last 4 characters, for display only |
| `summaryEnabled` | boolean | ya | `true` |  |
| `summaryHour` | integer | ya | `6` | Jakarta hour the daily summaries are written |
| `includeProjects` | boolean | ya | `true` | also one summary per active project, not only the whole bank |
| `monthlyBudget` | double precision | tidak |  | stop writing summaries once this month's cost reaches this; null = no cap |
| `priceInput` | double precision | ya | `0.3` | Prices per 1M tokens, used to estimate each call's cost. |
| `priceCachedInput` | double precision | ya | `0.006` |  |
| `priceOutput` | double precision | ya | `1.2` |  |
| `currency` | text | ya | `'USD'::text` |  |
| `updatedBy` | text | tidak |  |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |

**Kunci:**
- `PRIMARY KEY (id)`

## AiSummary

One AI summary of one scope ("bank" or an API key id) for one complete Jakarta data day (written the morning after).

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `scope` | text | ya |  | "bank" \| ApiKey.id |
| `scopeName` | text | ya |  | name when written, so history stays readable after a project is removed |
| `day` | text | ya |  | data day YYYY-MM-DD, Asia/Jakarta (normally yesterday when written) |
| `status` | text | ya |  | "ok" \| "failed" |
| `content` | jsonb | tidak |  | SummaryContent (lib/ai/summary.ts) |
| `error` | text | tidak |  |  |
| `model` | text | ya |  |  |
| `attempts` | integer | ya | `1` |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |

**Kunci:**
- `PRIMARY KEY (id)`

**Index:**
- `CREATE INDEX "AiSummary_day_idx" ON "AiSummary" USING btree (day)`
- `CREATE UNIQUE INDEX "AiSummary_scope_day_key" ON "AiSummary" USING btree (scope, day)`

## AiUsageLog

Every call to the platform AI provider, with tokens and estimated cost: the cost history on the AI settings page.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | integer | ya | `nextval('"AiUsageLog_id_seq"'::regclass)` |  |
| `at` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |
| `purpose` | text | ya |  | "summary" \| "test" |
| `scope` | text | tidak |  |  |
| `scopeName` | text | tidak |  |  |
| `model` | text | ya |  |  |
| `inputTokens` | integer | ya | `0` |  |
| `cachedTokens` | integer | ya | `0` | part of inputTokens served from the provider's cache |
| `outputTokens` | integer | ya | `0` |  |
| `cost` | double precision | ya | `0` |  |
| `currency` | text | ya |  |  |
| `ok` | boolean | ya |  |  |
| `error` | text | tidak |  |  |
| `ms` | integer | ya | `0` |  |

**Kunci:**
- `PRIMARY KEY (id)`

**Index:**
- `CREATE INDEX "AiUsageLog_at_idx" ON "AiUsageLog" USING btree (at)`

## ApiKey

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `name` | text | ya |  |  |
| `prefix` | text | ya |  |  |
| `hash` | text | ya |  |  |
| `keyEnc` | text | tidak |  | the full key, AES-256-GCM (lib/server/secrets.ts), so admins can copy it later; null for keys made before this |
| `keywords` | text[] | tidak | `ARRAY[]::text[]` | empty = whole bank; else items must mention one |
| `scope` | jsonb | ya | `'{}'::jsonb` | other fixed restrictions, see lib/media/keyScope.ts |
| `ownerId` | text | tidak |  | account that owns the key (role user); null = managed by admins |
| `createdBy` | text | tidak |  | admin username; null for keys made before this was recorded |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |
| `lastUsedAt` | timestamp(3) without time zone | tidak |  |  |
| `revokedAt` | timestamp(3) without time zone | tidak |  |  |
| `showAuthors` | boolean | ya | `false` | unused: author details are now always returned |
| `allowedIps` | text[] | tidak | `ARRAY[]::text[]` | empty = any IP; else "1.2.3.4", "1.2.3.0/24" or IPv6 (lib/keyAccess.ts) |
| `allowedOrigins` | text[] | tidak | `ARRAY[]::text[]` | empty = any site; else "app.example.id" or "*.example.id" (browser calls) |
| `manualLabels` | text[] | tidak | `ARRAY[]::text[]` | Manual label choices of this project (in order), set by its owner or an admin; people label posts with one of them. |

**Kunci:**
- `PRIMARY KEY (id)`

**Index:**
- `CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey" USING btree (hash)`

## ApiKeyUsage

Public API calls per key per day (Jakarta date). Summed over an account's keys for its daily plan limit.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `day` | text | ya |  | YYYY-MM-DD, Asia/Jakarta |
| `count` | integer | ya | `0` |  |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId", day)`

**Index:**
- `CREATE INDEX "ApiKeyUsage_day_idx" ON "ApiKeyUsage" USING btree (day)`

## ArchivedReport

Executive report snapshot of one scope ("bank" or an API key id) for one complete period, written by the worker once the period is over: harian (one Jakarta day), mingguan (Monday-Sunday) or bulanan (a calendar month). `data` is the ReportData the print page renders; `cover` holds the few numbers the archive cards show.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `scope` | text | ya |  | "bank" \| ApiKey.id |
| `scopeName` | text | ya |  | name when written, so the archive stays readable after a project is renamed or removed |
| `kind` | text | ya |  | "harian" \| "mingguan" \| "bulanan" |
| `start` | text | ya |  | first data day YYYY-MM-DD, Asia/Jakarta |
| `day` | text | ya |  | last data day YYYY-MM-DD, Asia/Jakarta |
| `data` | jsonb | ya |  | ReportData (lib/report.ts) |
| `cover` | jsonb | ya |  | ReportCover (lib/report.ts) |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |

**Kunci:**
- `PRIMARY KEY (id)`

**Index:**
- `CREATE INDEX "ArchivedReport_scope_kind_day_idx" ON "ArchivedReport" USING btree (scope, kind, day)`
- `CREATE UNIQUE INDEX "ArchivedReport_scope_kind_start_key" ON "ArchivedReport" USING btree (scope, kind, start)`

## BalanceSnapshot

Provider credit over time, recorded by the worker and on manual refresh; spend = drops between snapshots.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | integer | ya | `nextval('"BalanceSnapshot_id_seq"'::regclass)` |  |
| `apiKeyId` | text | ya |  |  |
| `currency` | text | ya |  |  |
| `total` | double precision | ya |  |  |
| `at` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY (id)`

**Index:**
- `CREATE INDEX "BalanceSnapshot_apiKeyId_at_idx" ON "BalanceSnapshot" USING btree ("apiKeyId", at)`

## Classification

One item's category for one API key.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `type` | text | ya |  | "social" \| "online" |
| `code` | text | ya |  | item code in the source database |
| `category` | text | ya |  | a category code, or "none" |
| `confidence` | double precision | tidak |  |  |
| `reason` | text | tidak |  |  |
| `publishedAt` | timestamp(3) without time zone | ya |  |  |
| `model` | text | ya |  |  |
| `manual` | boolean | ya | `false` | set by an admin; the worker never overwrites it |
| `correctedBy` | text | tidak |  |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId", type, code)`

**Index:**
- `CREATE INDEX "Classification_apiKeyId_type_category_publishedAt_idx" ON "Classification" USING btree ("apiKeyId", type, category, "publishedAt")`

## Classifier

AI categorisation settings and progress for one API key.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `providerKind` | text | ya |  | The AI service this key uses, with its own credentials. "anthropic" \| "openai_compatible" |
| `providerBaseUrl` | text | tidak |  | openai_compatible only, e.g. https://api.deepseek.com |
| `providerModel` | text | ya |  |  |
| `providerKeyEnc` | text | ya |  | AES-256-GCM, see lib/server/secrets.ts |
| `providerKeyHint` | text | ya |  | last 4 characters, for display only |
| `fallbackKind` | text | tidak |  | Optional fallback, used for a batch only when the main provider fails (5xx, empty reply, timeout). |
| `fallbackBaseUrl` | text | tidak |  |  |
| `fallbackModel` | text | tidak |  |  |
| `fallbackKeyEnc` | text | tidak |  |  |
| `fallbackKeyHint` | text | tidak |  |  |
| `enabled` | boolean | ya | `true` |  |
| `prompt` | text | ya |  |  |
| `categories` | jsonb | ya |  | [{ code, label, description }] |
| `onlineCategories` | jsonb | tidak |  | online news' own categories; null = same as `categories` |
| `minBalance` | double precision | tidak | `1` | pause when provider credit drops below this; null = no floor |
| `dailyBudget` | double precision | tidak |  | pause once today's spend reaches this; null = no cap |
| `scopeCounts` | jsonb | tidak |  | Item counts for the key's whole scope ({ social, online, at }); counting takes ~25 s, so it is kept here. |
| `labelledOnly` | boolean | ya | `false` | API returns only items the AI has labelled |
| `startFrom` | timestamp(3) without time zone | tidak |  | oldest publish time to label; null = the whole scope. Newer items are always labelled. |
| `cursors` | jsonb | ya | `'{}'::jsonb` | Progress per media type: { social: { newest, oldest, done }, online: {...} } (ISO timestamps) |
| `processed` | integer | ya | `0` |  |
| `failed` | integer | ya | `0` |  |
| `todayCount` | integer | ya | `0` |  |
| `todayDate` | text | ya | `''::text` |  |
| `lastError` | text | tidak |  |  |
| `lastRunAt` | timestamp(3) without time zone | tidak |  |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId")`

## ContactRequest

Sales enquiries from the public /kontak page (e.g. the Instansi plan's "Hubungi kami").

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `name` | text | ya |  |  |
| `organization` | text | ya |  |  |
| `email` | text | ya |  |  |
| `phone` | text | tidak |  |  |
| `plan` | text | tidak |  | plan the visitor came from, e.g. "instansi" |
| `message` | text | ya |  |  |
| `handled` | boolean | ya | `false` |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |

**Kunci:**
- `PRIMARY KEY (id)`

**Index:**
- `CREATE INDEX "ContactRequest_handled_createdAt_idx" ON "ContactRequest" USING btree (handled, "createdAt")`

## Invoice

Manual billing: an invoice for one plan period. Marking it paid sets the account's plan and end date.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `number` | text | ya |  | SB-2026-0001 |
| `accountId` | text | ya |  |  |
| `kind` | text | ya | `'plan'::text` | plan \| topup (extra Signalbase AI posts for one month) |
| `plan` | text | ya |  | starter \| pro \| instansi (for a top-up: the plan it was bought on) |
| `billing` | text | ya |  | monthly \| yearly (top-up: monthly) |
| `topupPosts` | integer | tidak |  | top-up only: posts added to that month's Signalbase AI quota |
| `subtotal` | integer | ya |  | rupiah, before tax |
| `tax` | integer | ya |  | rupiah |
| `total` | integer | ya |  |  |
| `periodStart` | timestamp(3) without time zone | ya |  |  |
| `periodEnd` | timestamp(3) without time zone | ya |  |  |
| `status` | text | ya | `'unpaid'::text` | unpaid \| paid \| cancelled |
| `dueAt` | timestamp(3) without time zone | ya |  |  |
| `paidAt` | timestamp(3) without time zone | tidak |  |  |
| `note` | text | tidak |  |  |
| `createdBy` | text | ya |  | username of whoever created it (the user or an admin) |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |

**Kunci:**
- `FOREIGN KEY ("accountId") REFERENCES "Admin"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY (id)`

**Index:**
- `CREATE INDEX "Invoice_accountId_createdAt_idx" ON "Invoice" USING btree ("accountId", "createdAt")`
- `CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice" USING btree (number)`
- `CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice" USING btree (status, "createdAt")`

## ItemLabel

One label of one post or article within one project; an item can carry several (one row each).

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `type` | text | ya |  | "social" \| "online" |
| `code` | text | ya |  |  |
| `label` | text | ya |  |  |
| `setBy` | text | ya |  | username |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |
| `additional_data` | jsonb | tidak |  |  |
| `createdAt` | timestamp(3) with time zone | ya | `CURRENT_TIMESTAMP` | Rows older than this column carry the time it was added, not when the label was given. |
| `score` | integer | tidak |  | AI confidence 0-100; null for a label a person gave. |
| `source` | text | ya | `'human'::text` | "human" \| "ai" |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId", type, code, label)`

**Index:**
- `CREATE INDEX "ItemLabel_apiKeyId_label_idx" ON "ItemLabel" USING btree ("apiKeyId", label)`

## LabelAi

AI labelling settings of one project ("Kustomisasi Label"), with its own provider key.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `provider` | text | ya |  | "deepseek" \| "grok"; the address follows from it, see lib/ai/labelAi.ts |
| `model` | text | ya |  |  |
| `keyEnc` | text | ya |  | AES-256-GCM, see lib/server/secrets.ts |
| `keyHint` | text | ya |  | last 4 characters, for display only |
| `prompt` | text | tidak |  | null = the default built from the project's labels |
| `startFrom` | timestamp(3) without time zone | tidak |  | oldest publish time to label; null = the whole scope |
| `updatedBy` | text | ya |  |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |
| `cursors` | jsonb | ya | `'{}'::jsonb` | Worker state. Cursors per media type: { social: { newest, oldest, backfillDone, ... } } |
| `dailyLimit` | integer | ya | `500` | posts sent per day (Jakarta) |
| `enabled` | boolean | ya | `false` |  |
| `errorStreak` | integer | ya | `0` |  |
| `failed` | integer | ya | `0` |  |
| `lastError` | text | tidak |  |  |
| `lastRunAt` | timestamp(3) without time zone | tidak |  |  |
| `processed` | integer | ya | `0` |  |
| `retryAfter` | timestamp(3) without time zone | tidak |  |  |
| `savedAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` | last save by a person (updatedAt also moves with the worker) |
| `todayCount` | integer | ya | `0` |  |
| `todayDate` | text | ya | `''::text` |  |
| `scopeCounts` | jsonb | tidak |  | Posts in the labelling range, cached because counting the source is slow. |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId")`

## LabelAiItem

What AI labelling has done with each post of a project, or that a person decided it.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `type` | text | ya |  | "social" \| "online" |
| `code` | text | ya |  |  |
| `status` | text | ya |  | "done" \| "empty" (no label fits) \| "failed" \| "waiting_text" \| "human" (AI leaves it alone) |
| `attempts` | integer | ya | `0` |  |
| `retryAfter` | timestamp(3) without time zone | tidak |  |  |
| `error` | text | tidak |  |  |
| `model` | text | tidak |  |  |
| `publishedAt` | timestamp(3) without time zone | tidak |  |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId", type, code)`

**Index:**
- `CREATE INDEX "LabelAiItem_apiKeyId_type_status_retryAfter_idx" ON "LabelAiItem" USING btree ("apiKeyId", type, status, "retryAfter")`

## LabelAiUsage

Tokens of AI labelling per hour and model, kept apart from categorisation's.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `hour` | timestamp(3) without time zone | ya |  |  |
| `model` | text | ya |  |  |
| `inputTokens` | integer | ya | `0` |  |
| `cachedTokens` | integer | ya | `0` |  |
| `outputTokens` | integer | ya | `0` |  |
| `calls` | integer | ya | `0` |  |
| `checkCachedTokens` | integer | ya | `0` |  |
| `checkInputTokens` | integer | ya | `0` | The source check's share of the tokens above (0 for rows from before it was kept apart), and its billable searches. |
| `checkOutputTokens` | integer | ya | `0` |  |
| `searches` | integer | ya | `0` |  |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId", hour, model)`

## MediaAsset

One image analysed by the local media worker (npm run media): news images, X photos/video thumbnails and YouTube thumbnails. Only the URL and the results are kept; the file itself is downloaded, analysed and discarded. One image used by many posts (syndicated news photos) is analysed once (MediaLink holds where it appears).

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `urlHash` | text | ya |  | sha256 of url |
| `url` | text | ya |  |  |
| `kind` | text | ya |  | "news" \| "x_photo" \| "x_video" \| "youtube" \| "instagram" \| "threads" |
| `status` | text | ya | `'pending'::text` | "pending" \| "done" \| "failed" (retried) \| "gone" (404/expired, not retried) |
| `error` | text | tidak |  |  |
| `attempts` | integer | ya | `0` |  |
| `nextAttemptAt` | timestamp(3) without time zone | tidak |  | After a failure, not retried before this (5 min, 30 min, 2 h), so a passing outage doesn't use up the attempts. |
| `placeholder` | boolean | ya | `false` | A news outlet's default picture (the same image on ≥5 of its articles): hidden from the media page. |
| `twinGroup` | text | tidak |  | Images whose dHash differs by ≤ NEAR_TWIN_BITS share a group (the id of its first image): the same picture re-encoded, resized or with a small overlay, shared under different URLs. Set by the worker after analysis. |
| `width` | integer | tidak |  |  |
| `height` | integer | tidak |  |  |
| `dhash` | text | tidak |  | 64-bit difference hash (hex): the same picture re-encoded or resized gets the same or a close hash |
| `ocrText` | text | tidak |  | text read from the image ("" = none), outlet watermarks removed |
| `ocrWords` | integer | ya | `0` |  |
| `ocrLines` | jsonb | tidak |  | OCR lines with size and position ([{ t, h, cy }], relative to the image height), for keyText. |
| `unreadText` | boolean | ya | `false` | Text was found but couldn't be read (mostly low-confidence lines): usually non-Latin script (Arabic, Cyrillic, Chinese). |
| `keyText` | text | tidak |  | "Teks penting": ocrText without app chrome (likes, "Lihat N balasan", times, handles), camera stamps, small background text and lines already in the post's caption. Used by the cards, the "Ada teks" filter and the search. |
| `keyWords` | integer | ya | `0` |  |
| `actionCall` | jsonb | tidak |  | Derived from keyText (src/lib/mediaVisual.ts), recomputed when TEXT_RULES_VERSION changes: a call to action (action word + date/time/place), the narrative key (same message on different pictures), and lines with numeric claims to check. |
| `narrative` | text | tidak |  |  |
| `claims` | text[] | tidak |  |  |
| `textRules` | integer | ya | `0` |  |
| `context` | text | tidak |  | Caption/title of the first item using the image (≤1000 chars), to drop OCR text that only repeats it. |
| `tags` | jsonb | tidak |  | [{ tag, score }] best visual tags (CLIP, zero-shot) |
| `tagList` | text[] | tidak |  | the tag codes, for filtering |
| `sensitive` | text[] | tidak |  | tags that mark possibly sensitive content (shown as "perlu ditinjau") |
| `model` | text | tidak |  |  |
| `analyzedAt` | timestamp(3) without time zone | tidak |  |  |
| `videoUrl` | text | tidak |  | The video this image is the poster of (X video, Instagram Reel): its speech is transcribed (scripts/media/layanan_asr.py). |
| `transcriptStatus` | text | tidak |  | null = no video; "pending" \| "done" \| "failed" \| "none" (no audio track, or too old when its turn came) |
| `transcript` | text | tidak |  | What was said in the first MEDIA_ASR_MAX_SECONDS of the video ("" = no speech), and the detected language. |
| `transcriptLang` | text | tidak |  |  |
| `transcriptAt` | timestamp(3) without time zone | tidak |  |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |

**Kunci:**
- `PRIMARY KEY (id)`

**Index:**
- `CREATE INDEX "MediaAsset_analyzedAt_idx" ON "MediaAsset" USING btree ("analyzedAt")`
- `CREATE INDEX "MediaAsset_dhash_idx" ON "MediaAsset" USING btree (dhash)`
- `CREATE INDEX "MediaAsset_narrative_idx" ON "MediaAsset" USING btree (narrative)`
- `CREATE INDEX "MediaAsset_status_createdAt_idx" ON "MediaAsset" USING btree (status, "createdAt")`
- `CREATE INDEX "MediaAsset_transcriptStatus_createdAt_idx" ON "MediaAsset" USING btree ("transcriptStatus", "createdAt")`
- `CREATE INDEX "MediaAsset_twinGroup_idx" ON "MediaAsset" USING btree ("twinGroup")`
- `CREATE UNIQUE INDEX "MediaAsset_urlHash_key" ON "MediaAsset" USING btree ("urlHash")`

## MediaCursor

Progress of the media worker per feed ("news", "x", "youtube"): the newest item already collected. `ts` is the source timestamp as text (WIB, no zone), exactly as compared in the source database.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `name` | text | ya |  |  |
| `ts` | text | ya |  |  |
| `code` | text | ya |  |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |

**Kunci:**
- `PRIMARY KEY (name)`

## MediaLink

Where an analysed image appears: one row per (item, position). publishedAt/source copy the item's, so the media page can list and filter without the source database.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `type` | text | ya |  | "social" \| "online" |
| `code` | text | ya |  | post_code / news_code in the source database |
| `position` | integer | ya |  |  |
| `assetId` | text | ya |  |  |
| `source` | text | ya |  | platform (twitter, youtube) or outlet |
| `publishedAt` | timestamp(3) without time zone | ya |  |  |
| `keys` | text[] | tidak | `ARRAY[]::text[]` | Projects (ApiKey ids) whose scope includes this item, set by the worker when the item is collected and backfilled when a project is created or its scope changes (MediaProjectSync). The media page filters on it. |
| `imageKeys` | text[] | tidak | `ARRAY[]::text[]` | Projects that match this item only through the text in its image (not its caption). The source-database queries of those projects include these items too (bank/query.ts scopeConditions, imageCodes). |

**Kunci:**
- `FOREIGN KEY ("assetId") REFERENCES "MediaAsset"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY (type, code, "position")`

**Index:**
- `CREATE INDEX "MediaLink_assetId_idx" ON "MediaLink" USING btree ("assetId")`
- `CREATE INDEX "MediaLink_imageKeys_idx" ON "MediaLink" USING gin ("imageKeys")`
- `CREATE INDEX "MediaLink_keys_idx" ON "MediaLink" USING gin (keys)`
- `CREATE INDEX "MediaLink_publishedAt_idx" ON "MediaLink" USING btree ("publishedAt")`

## MediaProjectSync

Backfill of MediaLink.keys per project: `signature` is a hash of the scope it was computed for; a different one (new project, keywords changed) restarts it. The cursor walks the links from newest to oldest.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `keyId` | text | ya |  |  |
| `signature` | text | ya |  |  |
| `cursorAt` | text | tidak |  | MediaLink."publishedAt" as text (to_char), compared as ::timestamp: a Date round-trip shifts it by the session time zone |
| `cursorCode` | text | tidak |  |  |
| `done` | boolean | ya | `false` |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |

**Kunci:**
- `PRIMARY KEY ("keyId")`

## MediaWorkerState

Health of the media worker (one row, id "main"), written every tick and shown to admins on the media page.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `id` | text | ya |  |  |
| `heartbeatAt` | timestamp(3) without time zone | ya |  |  |
| `serviceOk` | boolean | ya |  |  |
| `lastError` | text | tidak |  |  |
| `lastTick` | jsonb | tidak |  | { collected, backfilled, analyzed, ms } |

**Kunci:**
- `PRIMARY KEY (id)`

## ProjectMember

A sub-account's access to one of its parent's projects, chosen by an admin. Members see the project and its data (media, insights, issues, reports) but cannot change, revoke or copy it; plan limits and quotas stay with the owner.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `accountId` | text | ya |  |  |
| `createdAt` | timestamp(3) without time zone | ya | `CURRENT_TIMESTAMP` |  |

**Kunci:**
- `FOREIGN KEY ("accountId") REFERENCES "Admin"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId", "accountId")`

**Index:**
- `CREATE INDEX "ProjectMember_accountId_idx" ON "ProjectMember" USING btree ("accountId")`

## ReportProfile

Who an executive report is written for, per scope ("bank" or an API key id): the reader's position and name, the institution whose decisions the report serves ("lensa"), its region, coordination partners and the classification. Read when a report is written and copied into it, so the archive keeps what was printed at the time.

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `scope` | text | ya |  | "bank" \| ApiKey.id |
| `recipientTitle` | text | ya | `''::text` | "Kapolda Riau" |
| `recipientName` | text | ya | `''::text` | "Irjen Pol Dr. …" |
| `institution` | text | ya | `''::text` | "Polda Riau": the institution the analysis is written for |
| `region` | text | ya | `''::text` | "Provinsi Riau" |
| `partners` | text[] | tidak | `ARRAY[]::text[]` | "Plt. Gubernur", "Kajati", … |
| `sifat` | text | ya | `'RAHASIA / TERBATAS'::text` |  |
| `updatedBy` | text | tidak |  |  |
| `updatedAt` | timestamp(3) without time zone | ya |  |  |

**Kunci:**
- `PRIMARY KEY (scope)`

## TokenUsage

Tokens the AI provider billed per key, hour, and model; works for every provider (no balance API needed).

| Kolom | Tipe | Wajib | Default | Keterangan |
|---|---|---|---|---|
| `apiKeyId` | text | ya |  |  |
| `hour` | timestamp(3) without time zone | ya |  | start of the hour (UTC) |
| `model` | text | ya |  |  |
| `inputTokens` | integer | ya | `0` |  |
| `outputTokens` | integer | ya | `0` |  |
| `calls` | integer | ya | `0` |  |
| `keyHint` | text | tidak |  | 4 huruf terakhir key penyedia yang membayar (sejak 16 Nov 2026); null = sebelum dicatat |

**Kunci:**
- `FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `PRIMARY KEY ("apiKeyId", hour, model)`
