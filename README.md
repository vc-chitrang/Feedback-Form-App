# Dynamic Feedback Form (white-label)

Visitor feedback for museums (and any venue: real estate, clinics, events…).

- **admin-app** — build the form (CRUD, drag-to-reorder), draft → publish, versions & rollback, logo, kiosk settings, devices, responses & CSV export.
- **client-app** — kiosk tablet app (offline-first) **and** visitor phone form via QR link. Welcome → one question per screen → thank you.
- **api** — Fastify + local PostgreSQL (PGlite, stored in a folder) + local file storage for logos.

## Run locally

Requirements: Node.js 22+, npm 10+. Nothing else to install (no Docker / Postgres).

```bash
npm install
cp api/.env.example api/.env   # then set ADMIN_EMAIL / ADMIN_PASSWORD (min 12 chars)
npm run dev                    # api :4000, admin :5173, client :5174
```

| App | URL |
|---|---|
| Admin | http://localhost:5173 — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `api/.env` |
| Kiosk | http://localhost:5174 — pair with a code from **Admin → Devices & QR → Add kiosk** |
| Phone (QR) | http://localhost:5174/?f=demo-museum |

First start creates the organisation, owner account and a published sample museum form (v1).
Local data lives in `api/data/` (database) and `api/storage/` (logos) — both git-ignored. Delete them to start fresh.

To test phones/tablets on the same Wi-Fi, open the client via this computer's LAN IP (Vite listens on all interfaces) and set `VITE_CLIENT_URL=http://<lan-ip>:5174` for the admin QR code.

```bash
npm test           # schema + API integration tests (in-memory DB)
npm run typecheck  # all workspaces
npm run build      # production builds of both apps
```

## Core rule: editing the form never touches collected feedback

> A **published version is immutable**. All edits happen in a **draft** copy. Every submission points to the **exact version** it was filled on.

- Questions/options have stable ids (`q_…`, `o_…`). Position is never identity, so reorder is safe.
- Delete = question absent from the next version. Old answers stay (FK `ON DELETE RESTRICT`); reports mark it *removed*. Restore keeps the same id.
- Changing a published question's **type** creates a new question (publish is blocked otherwise).
- Immutability is enforced **in the database** (trigger), not only in code.
- Publish is one transaction: live → archived, draft → live, pointer swap. Rollback re-points to an older version.

**"Publish when the app isn't in use"** — kiosks poll every 60 s, download the full new version (+ logo) into IndexedDB, and switch **only while idle on the welcome screen**. A visitor mid-form finishes on the version they started; the server accepts submissions for any released version (also for kiosks that were offline for days). Admin → Devices shows which version each kiosk runs.

## Architecture

```
admin-app (React SPA) ──┐                    ┌── client-app (React PWA)
                        │  /api (Vite proxy)  │   kiosk: device token, IndexedDB cache + outbox
                        ▼                     ▼   QR: /?f=<slug>, same renderer
                  api (Fastify, zod validation, rate limits)
                   │                          │
            PGlite (local Postgres)    LocalDiskStorage (logos)
shared: packages/form-schema  (types, validation, publish rules — used by all three)
        packages/form-renderer (question UI — kiosk AND admin preview, pixel-identical)
```

| Folder | What |
|---|---|
| `packages/form-schema` | Question types (zod), `checkAnswer` / `validateSubmission`, `validateForPublish`, `diffDocs` |
| `packages/form-renderer` | `WelcomeScreen`, `FormFlow`, `ThankYouScreen`, all inputs |
| `api/src/migrations.ts` | Schema + immutability trigger |
| `api/src/services/forms.ts` | Draft / publish / rollback |
| `api/src/services/submissions.ts` | Idempotent ingestion, validated against the submission's own version |
| `client-app/src/lib/engine.ts` | Offline engine: version cache, safe swap, outbox sync with backoff, heartbeat |

## Question types

Single choice (list / chips, “Other – specify”), multiple choice (min/max, exclusive “None of these”), dropdown, yes/no,
short text (optional *name* format — Unicode, so Devanagari names work), long text, number, date (block future/past),
email (typo hints like `gmial.com`), mobile (country code, stored E.164), consent, star rating (3–10), smiley scale,
NPS 0–10, slider (starts **empty** — no biased default), section/info text.

## Validation & security

- Same rules on client (UX) and server (source of truth). Server rejects unknown questions, options not in that version, wrong types, oversize text.
- Idempotent submissions (client UUID) — double taps and retries never duplicate.
- Admin: scrypt-hashed passwords, httpOnly `SameSite=Strict` session cookie, origin check on mutations, roles owner/editor/viewer, audit log.
- Kiosk: one-time pairing codes (15 min), device tokens stored hashed, revocable.
- Public link: rate limited, rejects sub-3-second "bots".
- Logo upload: type detected from file bytes (PNG/JPEG/WebP, ≤ 2 MB); SVG refused (can carry scripts).
- CSV export: formula-injection safe, UTF-8 BOM for Excel. Email/phone are hidden from summaries.
- Kiosk privacy: autocomplete off, idle reset ("Are you still there?") wipes answers.

## Not done yet (next phases)

- Multi-language UI (data model already stores text per language).
- Editable welcome/thank-you text & layout, theme colour picker (fields exist in the theme; no editor yet).
- Conditional logic, matrix/ranking/image-choice questions, scheduled publish, user management UI.
- Native kiosk lock (Capacitor shell / Android device-owner); today it is a PWA.
- Encrypting the on-device outbox; row-level security when moving to a real Postgres server; S3 storage adapter.
- DPDP "erase this visitor's data" admin action and automatic retention purge.
