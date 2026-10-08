# Manual Test Cases — Dynamic Feedback Form

**Version under test:** v0.1.x · **Last updated:** 2026-10-08

## How to use this document

- Run each case in order within a section. Mark the **Result** column `Pass` / `Fail` and note the browser/device.
- **Priority:** P1 = must pass before any release · P2 = should pass · P3 = nice to have.
- Unless stated, use the **live** environment:

| App | URL |
|---|---|
| Admin | https://vc-chitrang.github.io/Feedback-Form-App/admin/ |
| Kiosk client | https://vc-chitrang.github.io/Feedback-Form-App/client/ |
| Visitor (QR) client | https://vc-chitrang.github.io/Feedback-Form-App/client/?f=demo-museum |
| API health | https://xzaaiztphayjjnvkkmvl.supabase.co/functions/v1/api/health |

- **Admin login:** `admin@demo-museum.test` + the password from `ADMIN_PASSWORD` in `api/.env` (ask the project owner; never share it in chat or tickets).
- **Test data:** use clearly fake values (e.g. `Test Visitor`, `qa+1@example.com`, `+91 98765 43210`). Every test submission is stored, so prefix free-text answers with `QA:`.
- **Two browsers:** many cases need the admin and the client open at the same time. Use one normal window + one private window, or two browsers.
- **Kiosk device tests:** a tablet is best; a desktop browser in DevTools device mode (≈1180×820) is acceptable.

### Result summary

| Section | Cases | Pass | Fail |
|---|---|---|---|
| A. Login & access | 6 | | |
| B. Form builder | 10 | | |
| C. Draft, publish & versioning (core) | 12 | | |
| D. Question types & validation (client) | 18 | | |
| E. Kiosk behaviour | 10 | | |
| F. Visitor QR mode | 4 | | |
| G. Responses & export | 7 | | |
| H. Branding & devices | 7 | | |
| I. Responsive layouts | 6 | | |
| J. Security | 7 | | |
| K. CI/CD & operations | 4 | | |

---

## A. Login & access

### TC-A01 — Admin login with valid credentials · P1
**Steps**
1. Open the Admin URL.
2. Enter the admin email and password.
3. Click **Sign in**.

**Expected:** Form builder opens. Sidebar shows *Demo Museum*, the live version (e.g. `Live: v7`), and your email with role `owner`.
**Result:** ____

### TC-A02 — Wrong password is rejected · P1
**Steps**
1. On the login page enter the correct email and password `wrong-password-123`.
2. Click **Sign in**.

**Expected:** Red message *"Email or password is incorrect"*. You stay on the login page. The message is the same for an unknown email (no hint which part is wrong).
**Result:** ____

### TC-A03 — Login rate limit · P2
**Steps**
1. Enter a wrong password and click **Sign in** 11 times within one minute.

**Expected:** After about 10 attempts the API refuses further attempts for a minute (error shown). Normal login works again after a minute.
**Result:** ____

### TC-A04 — Sign out · P1
**Steps**
1. While logged in, click **Sign out** (bottom of sidebar; on phones scroll the sidebar).
2. Press the browser **Back** button.

**Expected:** Login page is shown. Going back does not show admin data; you must sign in again.
**Result:** ____

### TC-A05 — Session ends when the tab is closed · P2
**Steps**
1. Log in. Close the tab (not just the page).
2. Open the Admin URL in a new tab.

**Expected:** Login page is shown (the hosted admin keeps its session only for the open tab).
**Result:** ____

### TC-A06 — Deep link to a page · P3
**Steps**
1. While logged in, open `…/admin/#/responses` directly in the address bar.

**Expected:** The Responses page opens.
**Result:** ____

---

## B. Form builder

> Precondition for B and C: logged in as admin.

### TC-B01 — Open a draft · P1
**Steps**
1. On Form builder, if the badge says **Live · vN**, click **Edit form**.

**Expected:** Badge changes to **Draft · based on vN**. Indicator shows **All changes saved**. Live visitors are not affected (the client still shows vN).
**Result:** ____

### TC-B02 — Add a question of every type · P1
**Steps**
1. Click **Add question**. The dialog lists types grouped as Choice / Scale / Text / Contact / Other, plus Templates.
2. Add one of each: Single choice, Multiple choice, Dropdown, Yes/No, Star rating, Smiley scale, Recommend (NPS), Slider, Short text, Long text, Number, Date, Email, Mobile number, Consent, Section/info.
3. Type a question text for each.

**Expected:** Each new question appears in the list with a blue **New** badge, right after the selected question. The preview on the right shows it. The save indicator goes *Saving…* → *All changes saved*.
**Result:** ____

### TC-B03 — Edit options of a choice question · P1
**Steps**
1. Select a Single choice question.
2. Rename an option, add an option (press **Enter** in the last option or click **Add option**), move an option up/down, delete one.
3. Tick **Asks to specify ("Other")** on one option.

**Expected:** Preview updates immediately. The "Other" option shows a text box when chosen in the preview.
**Result:** ____

### TC-B04 — Reorder by drag and drop · P1
**Steps**
1. Drag a question by the ⋮⋮ handle to a new position.
2. Use the ↑ / ↓ buttons on another question.

**Expected:** Numbers update; the order is saved (reload the page — order is kept).
**Result:** ____

### TC-B05 — Duplicate a question · P2
**Steps**
1. Click the **Duplicate** icon on a question.

**Expected:** A copy appears directly below with a **New** badge. Editing the copy does not change the original.
**Result:** ____

### TC-B06 — Delete a question that has answers · P1
**Steps**
1. Click the **Delete** icon on a question that shows *N answers*.

**Expected:** A confirmation explains the question is removed only when you publish and that its **N existing answers are not deleted**. After confirming, it appears under **Removed in this draft** with a **Restore** link.
**Result:** ____

### TC-B07 — Restore a removed question · P1
**Steps**
1. In **Removed in this draft**, click **Restore**.

**Expected:** The question returns to the list (no **New** badge — it keeps its identity, so reports stay continuous).
**Result:** ____

### TC-B08 — Change type of a published question · P1
**Steps**
1. Select a question that already exists in the live version.
2. Change **Type** (e.g. Star rating → Short text).

**Expected:** A dialog warns that this creates a **new question** so old answers stay with the original. After confirming, the old one moves to *Removed in this draft* and a **New** question appears.
**Result:** ____

### TC-B09 — Searchable type and country dropdowns · P3
**Steps**
1. Open the **Type** dropdown; type `sli` in its search box.
2. Add/select a Mobile number question; open **Default country**; search `india`.

**Expected:** Lists filter as you type; arrow keys + Enter select; Esc closes. Country shows names with dialling codes, e.g. *India (+91)*.
**Result:** ____

### TC-B10 — Preview modes · P2
**Steps**
1. In the preview, switch **Welcome / Questions / Thank you** and **Kiosk / Phone**.
2. Click a question in the list.

**Expected:** Preview jumps to that question; Kiosk and Phone frames render without cut-off content.
**Result:** ____

---

## C. Draft, publish & versioning (core requirement)

> These cases prove: **reordering, deleting and adding questions never changes feedback already submitted.**

### TC-C01 — Record the baseline · P1
**Steps**
1. Open **Responses**. Note the total number of responses (e.g. 174) and the answer counts of 2–3 questions.
2. Open **Versions**. Note the live version number and its response count.

**Expected:** Numbers recorded for later cases.
**Result:** ____

### TC-C02 — Publish is blocked when the draft is invalid · P1
**Steps**
1. In the draft, add a Single choice question with an empty question text, or delete options until only one is left.
2. Click **Review & publish**.

**Expected:** Dialog lists the problem under **Fix before publishing**; **Publish** is disabled. Clicking the message selects the faulty question.
**Result:** ____

### TC-C03 — Review shows exactly what changes · P1
**Steps**
1. Make the draft valid. In total: delete 2 existing questions, add 2 new ones, and reorder some.
2. Click **Review & publish**.

**Expected:** Dialog shows **+2 added**, **−2 removed (answers kept)**, **Question order changed**, and confirms existing answers stay linked to their version.
**Result:** ____

### TC-C04 — Publish a new version · P1
**Steps**
1. Click **Publish vN+1**.

**Expected:** Success message; badge shows **Live · vN+1**. **Versions** shows the new version as **Live** and the previous one as **Archived**.
**Result:** ____

### TC-C05 — Old data untouched after publish · P1
**Steps**
1. Open **Responses** → total responses and the answer counts noted in TC-C01.
2. Filter **Version** = the previous version.

**Expected:** Total is unchanged. Removed questions still appear with a **Removed** badge and their old counts. Old individual responses show the original question wording.
**Result:** ____

### TC-C06 — Visitor mid-form keeps the old version · P1
**Steps**
1. Client (QR URL): click **Start**, answer the first 2 questions. **Do not finish.**
2. In admin, publish another small change (e.g. edit a help text).
3. Back on the client, finish and **Submit**.

**Expected:** The visitor sees no change mid-form; submission succeeds (thank-you screen). In admin → Responses, the new response is tagged with the **older** version number.
**Result:** ____

### TC-C07 — Client picks up the new version between visitors · P1
**Steps**
1. Leave a kiosk (or QR page) on the **Welcome** screen.
2. Publish a new version in admin.
3. Wait up to 60 seconds (or reload the client).

**Expected:** The version label at bottom-left of the welcome screen changes to the new number. The new questions are shown on the next **Start**.
**Result:** ____

### TC-C08 — Renamed option merges in reports · P2
**Steps**
1. In a draft, rename an option (e.g. *Tour group* → *Guided tour*) and publish.
2. Open **Responses** for *All versions*.

**Expected:** One row for the option with old + new answers combined (the option keeps its identity).
**Result:** ____

### TC-C09 — Rollback to an older version · P1
**Steps**
1. **Versions** → on an archived version click **Roll back** → confirm.
2. Check the client after up to 60 s.

**Expected:** That version becomes **Live**; responses of all versions remain. Client shows the rolled-back form. Roll back again to the latest version afterwards.
**Result:** ____

### TC-C10 — View an old version (read-only) · P2
**Steps**
1. **Versions** → **View** on an archived version → click **Start** in the preview.

**Expected:** The old form is shown exactly as visitors saw it; it cannot be edited.
**Result:** ____

### TC-C11 — Discard a draft · P2
**Steps**
1. Make changes in a draft. Click **Discard draft** → confirm.

**Expected:** Builder returns to the live version; changes are gone; responses unaffected.
**Result:** ____

### TC-C12 — Two admins edit the same draft · P2
**Steps**
1. Open the builder in two browsers (both logged in) with the same draft.
2. Change something in browser 1 and wait for *All changes saved*.
3. Change something in browser 2.

**Expected:** Browser 2 shows **Someone else edited this draft** with a **Reload** link instead of silently overwriting.
**Result:** ____

---

## D. Question types & validation (client)

> Use the QR client URL. The live form (v7+) includes most types; number, date and slider exist in v3 — test them by adding them to a draft and publishing, or check the screenshots in `Screenshots/18–20`.

### TC-D01 — Welcome screen · P1
**Steps:** Open the QR URL.
**Expected:** Logo (if set), title, subtitle, **Start** button, "About N min · N questions", version label bottom-left.
**Result:** ____

### TC-D02 — Required question blocks Next · P1
**Steps:** On a required question (red *) click **Next** without answering.
**Expected:** Red message (e.g. *Please pick a value*); you stay on the question.
**Result:** ____

### TC-D03 — Star rating · P1
**Steps:** Hover/tap stars; tap 4.
**Expected:** Stars fill; word label shown (e.g. *Good*); moves to next question automatically after ~0.3 s.
**Result:** ____

### TC-D04 — Recommend (0–10) · P1
**Steps:** Tap 9.
**Expected:** Selected highlighted; auto-advance. Labels *Not likely* / *Extremely likely* shown.
**Result:** ____

### TC-D05 — Yes / No · P2
**Steps:** Tap **Yes**.
**Expected:** Highlighted; auto-advance.
**Result:** ____

### TC-D06 — Single choice (list and chips) · P1
**Steps:** Tap an option; on the age-group question tap a chip.
**Expected:** One selection only; auto-advance.
**Result:** ____

### TC-D07 — Dropdown: search and pick · P1
**Steps:** On *Which city…* tap the box; type `pu`; tap **Pune**.
**Expected:** Large option panel opens; list filters with highlighted match; selected value shows in the box with a tick in the list.
**Result:** ____

### TC-D08 — Dropdown: city not in list · P1
**Steps:** Clear the box, type `Surat`; tap **Use "Surat"**; continue and submit later.
**Expected:** Value accepted; in admin the response shows **Other: Surat**.
**Result:** ____

### TC-D09 — Multiple choice limits and "Other" · P1
**Steps:** On *Which galleries…* select 3 options; try a 4th; select **Other** and leave its box empty; click **Next**; then type `QA: Textiles`.
**Expected:** "3 of 3 selected"; 4th option disabled; empty Other → *Please specify*; with text → continues.
**Result:** ____

### TC-D10 — Exclusive "None of these" · P2
**Steps:** On *Which facilities…* select two options, then **None of these**.
**Expected:** Selecting *None of these* clears the others (and vice versa).
**Result:** ____

### TC-D11 — Smiley scale · P2
**Steps:** Tap a face.
**Expected:** Selected face enlarged, others faded; auto-advance.
**Result:** ____

### TC-D12 — Long text · P2
**Steps:** Type a comment; check the counter; press **Enter** (new line), then **Next**.
**Expected:** Counter `n/1000`; Enter adds a new line (does not submit).
**Result:** ____

### TC-D13 — Name field (letters only) · P1
**Steps:** On *Your name* try: `1234` → Next; then `श्रीकांत D'Souza` → Next.
**Expected:** Numbers rejected (*Use letters only…*); Devanagari, apostrophes, hyphens accepted. **Enter** also moves to the next question.
**Result:** ____

### TC-D14 — Email validation and typo hint · P1
**Steps:** Type `qa@gmial.com`; then try `a@b`.
**Expected:** Hint *Did you mean qa@gmail.com?* (tap to accept). `a@b` → *Enter a valid email address…*.
**Result:** ____

### TC-D15 — Mobile number · P1
**Steps:** Country *IN +91*; type `98200` → Next; then `98765 43210` → Next. Try another country.
**Expected:** Short number rejected; valid number accepted (stored as `+919876543210`).
**Result:** ____

### TC-D16 — Number / Date / Slider · P2
**Steps:** (Form with these types) Number: use − / + and type `abc`; Date: try a future date; Slider: press **Next** without touching it (required), then drag.
**Expected:** Number rejects non-numbers and respects min/max; future date rejected when blocked; untouched required slider shows *Please pick a value* (no default value is submitted).
**Result:** ____

### TC-D17 — Consent and submit · P1
**Steps:** Tick **I agree**; press **Submit**; double-click **Submit** quickly on a second run.
**Expected:** Thank-you screen. Only **one** response is stored even with a double click (check Responses count +1).
**Result:** ____

### TC-D18 — Back navigation keeps answers · P2
**Steps:** Answer 3 questions, press **Back** twice, then **Next**.
**Expected:** Earlier answers are still selected.
**Result:** ____

---

## E. Kiosk behaviour

> Use the kiosk URL (no `?f=`) on a tablet or a browser window ≈1180×820.

### TC-E01 — Pair a kiosk · P1
**Steps**
1. Admin → **Devices & QR** → **Add kiosk** → name `QA Tablet` → **Create pairing code**.
2. On the kiosk URL enter the 8-character code → **Pair kiosk**.

**Expected:** Kiosk shows the welcome screen. Admin device list shows **QA Tablet · Online** with the running version.
**Result:** ____

### TC-E02 — Pairing code is single-use and expires · P1
**Steps:** Use the same code on another browser; also try a code older than 15 minutes.
**Expected:** *This code is invalid or has expired…*
**Result:** ____

### TC-E03 — Idle reset protects privacy · P1
**Steps:** **Start**, type a name, then don't touch the screen for the idle time (default 60 s).
**Expected:** *Are you still there?* with a 15-s countdown. Tapping **I'm still here** continues; letting it run out returns to Welcome and the typed answers are gone.
**Result:** ____

### TC-E04 — Thank-you auto-return · P1
**Steps:** Submit a form on the kiosk.
**Expected:** Thank-you screen with a progress bar; returns to Welcome after the configured seconds (default 8).
**Result:** ____

### TC-E05 — Works offline · P1
**Steps**
1. On the kiosk turn off Wi-Fi (or DevTools → Network → **Offline**).
2. Complete and submit 2 forms.
3. Turn the network back on and wait up to a minute.

**Expected:** Offline: thank-you shown, bottom-right badge *2 saved on this device · will send automatically*. Online: badge disappears; admin shows the 2 new responses.
**Result:** ____

### TC-E06 — Survives reload while offline · P2
**Steps:** While offline with saved responses, reload the kiosk page.
**Expected:** Form still loads from the device cache; saved responses are still pending and upload when online.
**Result:** ____

### TC-E07 — Staff status panel · P2
**Steps:** Tap the top-left corner 5 times quickly.
**Expected:** *Kiosk status* panel: organisation, kiosk name, form version, connection, waiting/rejected counts, **Sync now**.
**Result:** ____

### TC-E08 — Unpair requires confirmation · P2
**Steps:** In the status panel type `unpair` (lowercase), then `UNPAIR`.
**Expected:** Button enabled only for exactly `UNPAIR`; kiosk returns to the setup screen.
**Result:** ____

### TC-E09 — Admin removes a kiosk · P1
**Steps:** Admin → Devices → **Remove** on `QA Tablet` → confirm. Use the kiosk.
**Expected:** Kiosk shows *This kiosk was removed in the admin app…* and the setup screen; it cannot submit.
**Result:** ____

### TC-E10 — Kiosk shows update badge in admin · P3
**Steps:** Kiosk mid-form; publish a new version.
**Expected:** Devices shows *Switches to vN when idle* until the kiosk returns to Welcome.
**Result:** ____

---

## F. Visitor QR mode

### TC-F01 — QR code opens the form · P1
**Steps:** Admin → Devices & QR → scan the QR code with a phone (or open the link).
**Expected:** Phone shows the live form; layout fits the screen.
**Result:** ____

### TC-F02 — No idle reset on personal phones · P2
**Steps:** Start the form on the phone and wait 2 minutes.
**Expected:** No *Are you still there?* prompt; answers kept.
**Result:** ____

### TC-F03 — Bot protection · P3
**Steps:** (Tester with API tools) submit a public response with `durationMs` < 3000.
**Expected:** Rejected (`422 too_fast`).
**Result:** ____

### TC-F04 — Unknown organisation link · P3
**Steps:** Open `…/client/?f=does-not-exist`.
**Expected:** Friendly *Cannot load the form…* message, no crash.
**Result:** ____

---

## G. Responses & export

### TC-G01 — Summary per question · P1
**Steps:** Open **Responses**.
**Expected:** Total responses; per question: bars with counts/percentages, averages for ratings, NPS score, latest comments for long text.
**Result:** ____

### TC-G02 — Personal data hidden in summary · P1
**Steps:** Look at the Name / Email / Mobile cards.
**Expected:** *Personal data — see individual responses or export.* (no values shown).
**Result:** ____

### TC-G03 — Filters · P2
**Steps:** Filter by a version, then by a date range (From/To).
**Expected:** Counts and list update to match.
**Result:** ____

### TC-G04 — Individual responses · P2
**Steps:** Expand a response; click **Load more** at the bottom.
**Expected:** Answers shown with the wording of the version they were given on; more rows load.
**Result:** ____

### TC-G05 — CSV export · P1
**Steps:** Click **Export CSV**; open the file in Excel.
**Expected:** File downloads; one column per question across all versions; removed questions marked `[removed]`; Hindi/Marathi text displays correctly.
**Result:** ____

### TC-G06 — CSV formula-injection safety · P2
**Steps:** Submit a long-text answer `=HYPERLINK("http://example.com","x")`; export CSV; open in Excel.
**Expected:** Shown as plain text (prefixed with `'`), not as a clickable formula.
**Result:** ____

### TC-G07 — Script text is shown safely · P2
**Steps:** Submit a long-text answer `QA: <script>alert(1)</script>`; view it in Responses.
**Expected:** Text shown literally; no alert pops up.
**Result:** ____

---

## H. Branding & devices

### TC-H01 — Upload a logo · P1
**Steps:** Branding & kiosk → **Edit** (opens draft) → upload a PNG under 2 MB → publish.
**Expected:** Logo shows in both previews, then on the client welcome and thank-you screens after publish.
**Result:** ____

### TC-H02 — Reject wrong files · P1
**Steps:** Try uploading an SVG, a PDF renamed to `.png`, and a 3 MB image.
**Expected:** Rejected with a clear message (SVG not allowed; must be PNG/JPEG/WebP; max 2 MB).
**Result:** ____

### TC-H03 — Remove / replace logo · P2
**Steps:** **Replace** the logo, then **Remove**, then publish.
**Expected:** Client shows no logo; older versions in *Versions → View* still show the logo they were published with.
**Result:** ____

### TC-H04 — Kiosk timers · P2
**Steps:** Set idle reset to 30 s and thank-you to 5 s → publish → test on kiosk.
**Expected:** New timings apply after the kiosk picks up the version.
**Result:** ____

### TC-H05 — Public link copy · P3
**Steps:** Devices & QR → click the copy icon next to the link.
**Expected:** Link copied (check by pasting).
**Result:** ____

### TC-H06 — Device online/offline status · P2
**Steps:** Close the kiosk tab; wait 4 minutes; refresh Devices.
**Expected:** Kiosk shows **Offline** and *last seen* time.
**Result:** ____

### TC-H07 — Remove device warns about unsent data · P3
**Steps:** With a kiosk that has *Waiting to sync* > 0, click **Remove**.
**Expected:** Dialog warns those responses will be lost unless it syncs first.
**Result:** ____

---

## I. Responsive layouts

> Use Chrome DevTools → device toolbar, or real devices.

### TC-I01 — Admin on phone (375 px) · P1
**Steps:** Open each admin page at 375×812.
**Expected:** No sideways page scrolling; nav scrolls horizontally; Versions and Devices show cards with full-width buttons; tapping a question in the builder scrolls to its editor.
**Result:** ____

### TC-I02 — Admin on tablet (768 px) · P2
**Steps:** Each admin page at 768×1024.
**Expected:** Sidebar visible; content fits; cards instead of tables on Versions/Devices.
**Result:** ____

### TC-I03 — Admin on desktop (1440 / 1920 px) · P1
**Steps:** Builder at 1440×900 and 1920×1080.
**Expected:** Three columns (questions · editor · preview); preview fits its column.
**Result:** ____

### TC-I04 — Client on small phone (320 px) · P1
**Steps:** QR client at 320×568; go through all questions.
**Expected:** Everything fits; NPS shows in two rows; buttons reachable.
**Result:** ____

### TC-I05 — Client on phone landscape · P2
**Steps:** 812×375 landscape.
**Expected:** Compact layout; answers visible above the Back/Next bar.
**Result:** ____

### TC-I06 — Client on large screen (2560 px) · P2
**Steps:** 2560×1440.
**Expected:** Whole UI scales up (larger text and buttons), not tiny in the middle.
**Result:** ____

---

## J. Security

### TC-J01 — Admin API needs login · P1
**Steps:** In a private window open `https://xzaaiztphayjjnvkkmvl.supabase.co/functions/v1/api/admin/form`.
**Expected:** `401` *Please sign in*.
**Result:** ____

### TC-J02 — Public Supabase key cannot read data · P1
**Steps:** (Tester with API tools) Call `https://xzaaiztphayjjnvkkmvl.supabase.co/rest/v1/submission?select=*` with the project's **anon** key.
**Expected:** `permission denied` (42501) for every table.
**Result:** ____

### TC-J03 — Published versions cannot be altered · P1
**Steps:** Covered by automated tests; manual: try to edit an archived version from the admin (there is no edit control) and check Versions after a rollback.
**Expected:** Archived versions are read-only; content identical before/after rollback.
**Result:** ____

### TC-J04 — Tampered submission rejected · P2
**Steps:** (API tools) POST a submission with an unknown question id or an option id not in that version.
**Expected:** `422 invalid_answers`; nothing stored.
**Result:** ____

### TC-J05 — No secrets in the repository · P1
**Steps:** Browse the public GitHub repo; search for `ADMIN_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `service_role`.
**Expected:** Only placeholders/examples; no real values.
**Result:** ____

### TC-J06 — Kiosk privacy · P2
**Steps:** On a kiosk, type an email, submit; next visitor taps the email field.
**Expected:** Browser does not suggest the previous visitor's email (autocomplete off).
**Result:** ____

### TC-J07 — Removed kiosk token stops working · P2
**Steps:** Covered by TC-E09.
**Expected:** Removed device cannot load or submit.
**Result:** ____

---

## K. CI/CD & operations

### TC-K01 — CI on push · P1
**Steps:** Push any commit to `main`; open GitHub → **Actions**.
**Expected:** **CI** (typecheck, tests, build) is green.
**Result:** ____

### TC-K02 — Apps redeploy on push · P1
**Steps:** After a push to `main`, wait for **Deploy apps to GitHub Pages**; hard-refresh the admin.
**Expected:** Workflow green; change visible on the live URL within ~2 minutes.
**Result:** ____

### TC-K03 — API redeploys when API code changes · P1
**Steps:** Push a change under `api/`; watch **Deploy API (Supabase Edge Function)**; open the API health URL.
**Expected:** Workflow green (tests run before deploy); health returns `{"ok":true}`.
**Result:** ____

### TC-K04 — Release tag · P3
**Steps:** `git tag v0.1.1 && git push origin v0.1.1`.
**Expected:** **Release** workflow creates a GitHub Release with admin, client and API zips + checksums.
**Result:** ____

---

## Defect reporting template

```
ID / title:
Test case: TC-__
Environment: live / local · browser + version · device · screen size
Steps to reproduce:
Expected:
Actual:
Screenshot / screen recording:
Severity: Blocker / Major / Minor / Cosmetic
```
