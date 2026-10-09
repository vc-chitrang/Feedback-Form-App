# Checking real data in Supabase (CRUD verification)

Dashboard: https://supabase.com/dashboard/project/xzaaiztphayjjnvkkmvl
- **Table Editor** (left menu, grid icon) – browse rows like a spreadsheet.
- **SQL Editor** (left menu, `>_` icon) – paste the queries below and click **Run**.
- **Storage** (left menu, bucket icon) – uploaded logos.

> Read-only rule: only run `select` queries here. Do all changes through the Admin app,
> so the app's rules (versioning, validation, audit log) apply. Editing rows by hand
> in Table Editor bypasses them.

## What each table holds

| Table | Holds |
|---|---|
| `tenant` | One museum (white-label customer) |
| `admin_user` / `admin_session` | Admin logins (password stored as scrypt hash, never plain) / active logins |
| `form` | The form; `live_version_id` points at the version kiosks show |
| `form_version` | Every version: `DRAFT` (editable), `PUBLISHED` (live), `ARCHIVED`. Questions are in `doc` (JSON) |
| `device` / `pairing_code` | Paired kiosks / one-time pairing codes (hashed) |
| `submission` | One row per visitor response, with `version_id` = exact version they saw |
| `answer` | One row per answered question, keyed by stable `question_uid` |
| `asset` | Uploaded logo metadata (file itself is in Storage) |
| `audit_log` | Who did what, when |

---

## C1 – CREATE: add a question (draft)

1. Admin → Builder → **Add question** (e.g. Short text, label `QA: CRUD test`). Wait for “Saved”.
2. SQL Editor:
   ```sql
   select id, status, revision, updated_at,
          jsonb_array_length(doc->'questions') as questions
   from form_version
   order by created_at desc;
   ```
3. **Expect:** a `DRAFT` row; `questions` went up by 1; `revision` and `updated_at` changed.
   The `PUBLISHED` row is unchanged.
4. See the new question itself:
   ```sql
   select q->>'uid' as uid, q->>'type' as type, q->'label' as label
   from form_version, jsonb_array_elements(doc->'questions') q
   where status = 'DRAFT';
   ```
   Note the `uid` of `QA: CRUD test`.

## C2 – READ: publish and submit

1. Admin → **Publish**.
2. ```sql
   select number, status, published_at from form_version order by number nulls first;
   select live_version_id from form;
   ```
   **Expect:** new number is `PUBLISHED`, previous one `ARCHIVED`, no `DRAFT` left,
   `form.live_version_id` = new version id.
3. Open client (QR link), fill the form, answer `QA: CRUD test` with `QA: hello`, submit.
4. ```sql
   select s.id, s.channel, s.received_at, v.number as version
   from submission s join form_version v on v.id = s.version_id
   order by s.received_at desc limit 5;

   select a.question_uid, a.value
   from answer a
   where a.submission_id = (select id from submission order by received_at desc limit 1);
   ```
   **Expect:** top submission is yours, `version` = the new number, an `answer` row
   with your uid and value `"QA: hello"`.

## C3 – UPDATE: edit / reorder question

1. Admin → Builder: rename `QA: CRUD test` to `QA: CRUD edited`, drag it to another position.
2. Rerun the C1 step-4 query.
3. **Expect:** only the `DRAFT` doc changed (new label, new position, **same uid**).
4. Prove old data is untouched:
   ```sql
   select q->'label' from form_version, jsonb_array_elements(doc->'questions') q
   where status = 'PUBLISHED' and q->>'uid' = '<uid from C1>';
   ```
   **Expect:** still the old label. Your C2 answer still exists.

## C4 – DELETE: remove question

1. Admin → Builder: delete `QA: CRUD edited`, then Publish.
2. ```sql
   select count(*) from answer where question_uid = '<uid from C1>';
   ```
   **Expect:** count unchanged (old answers kept). Admin → Responses still shows
   them under the older version.

## C5 – Database protection (optional, proves immutability)

```sql
update form_version set doc = '{}' where status = 'PUBLISHED';
```
**Expect:** error `published form versions are immutable`. Nothing changed.
(This is the trigger guarding your main requirement. Safe – it is rejected.)

## Other quick checks

```sql
-- Responses per version
select v.number, v.status, count(s.id)
from form_version v left join submission s on s.version_id = v.id
group by v.number, v.status order by v.number;

-- Kiosks
select name, last_seen_at, outbox_size, revoked_at from device;

-- Recent admin actions
select * from audit_log order by 1 desc limit 20;
```

## Clean up test data (only if needed)

Test submissions start with `QA:`. Delete through the app if possible. If you must
use SQL, take a backup first (Database → Backups) and run a `select` with the same
`where` before any `delete`.
