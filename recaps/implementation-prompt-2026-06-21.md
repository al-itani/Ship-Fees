# Ship Fees — Implementation Prompt

Implement the tasks below in order. Read `CLAUDE.md` first. After each task, state which reload is needed (`Ctrl+R` renderer-only, or full `npm run dev` restart for main-process changes).

---

## Project Context

Windows desktop app (Electron 29 + React 18 + Vite + better-sqlite3) for Port of Beirut staff. Calculates berthing fees, records cargo services, generates receipts, AI-assisted document import via Claude vision API.

**Architecture (never break):**
```
Renderer (React) → window.api.* (preload.js contextBridge) → IPC → main.js → handlers → SQLite
```
- Renderer never touches DB directly.
- All API/AI calls go through main process; Claude API key never exposed to renderer.
- Soft deletes only (`UPDATE ... SET is_deleted = 1`); audit_log entry on every INSERT/UPDATE/soft-delete.
- Every new UI string needs keys in BOTH `src/i18n/en.json` and `src/i18n/ar.json`.
- Financial numbers always `dir="ltr"` (use `className="num-ltr"`).
- All schema changes use `ALTER TABLE ... ADD COLUMN` or `CREATE TABLE IF NOT EXISTS` wrapped in try/catch (existing migration pattern in `electron/database/schema.js`).
- New IPC handler → must register in `electron/main.js` AND expose in `electron/preload.js`. For client mode (optional, defer unless asked): also add to `electron/client.js` + `electron/server.js`.

**Key file map:**
- Main process: `electron/main.js`, `electron/preload.js`
- DB: `electron/database/db.js`, `electron/database/schema.js`, `electron/database/handlers/*.js`
- Other handlers: `electron/handlers/ai.js`, `electron/handlers/settings.js`
- Session: `src/context/SessionContext.jsx`
- Routing: `src/screens/MainApp.jsx` (useState-based, no router lib)
- Login: `src/screens/Login.jsx`, `src/screens/ChangePassword.jsx`, `src/App.jsx`
- Automate: `src/screens/automate/AutomateScreen.jsx`, `src/screens/automate/BatchImport.jsx`, `src/logic/automateImport.js`, `src/logic/batchGrouping.js`, `src/components/DocumentImport.jsx`
- Users: `src/screens/users/UserManagementScreen.jsx`, `src/screens/users/ManagerStaffScreen.jsx`, `electron/database/handlers/users.js`, `electron/database/handlers/auth.js`
- Audit: `src/screens/audit/AuditLogScreen.jsx`, `electron/database/handlers/audit.js`
- Sidebar/TopBar: `src/components/Sidebar.jsx`, `src/components/TopBar.jsx`
- Global CSS: `src/styles/index.css` (Tailwind base + CSS vars + .num-ltr)

---

## Execution Order

Implement in this order. Merged steps must be one commit each.

1. **A1** — Center/align layout
2. **C4 + D1 (merged)** — Native Windows dialogs (replace window.confirm/alert app-wide)
3. **C1** — Disable login button when fields empty
4. **D3** — OS local timezone for all timestamps
5. **B4 (study)** → **B5** — Per-field uncertainty messaging
6. **B1 + B2 + B3 + B6 + B10 (merged)** — Automate page consolidation
7. **B8 + B9 (merged)** — Concurrent AI processing + per-receipt progress
8. **B11** — "View Receipt" after save
9. **C3 + D2 (merged)** — Super-admin + profile fields/avatar + pin self
10. **E1** → **E2** — Usage stats table + screen
11. **C2 (study)** — Save credentials / Windows SSO study (deliverable: md doc)

---

## Tasks

### A1 — Layout centering (LTR + RTL)

**Files:** `src/screens/MainApp.jsx`, `src/styles/index.css`.

**Root cause:** Each screen sets its own `padding` + `maxWidth` (e.g. `AutomateScreen.jsx` padding:28, maxWidth:960; `UserManagementScreen.jsx` maxWidth:1100) but no horizontal auto-margin. With `dir="ltr"` content pins left; with `dir="rtl"` it pins right. The content area in `MainApp.jsx:104` is `flex:1` full-width with no centering.

**Changes:**
- In `MainApp.jsx` content area (the `<div style={{ flex: 1, overflow: 'auto', ... }}>` wrapping `renderScreen()`), add `display:flex; justifyContent:center; alignItems:flex-start`.
- Add a shared CSS class `.app-screen { width: 100%; margin-inline: auto; }` in `src/styles/index.css`.
- Apply `className="app-screen"` to each screen root div so its existing `maxWidth` becomes centered consistently in LTR and RTL.

**Risk:** Low. Renderer-only. Reload: Ctrl+R.

---

### C4 + D1 (merged) — Native Windows dialogs

**Files:** `electron/main.js`, `electron/preload.js`, `src/screens/users/UserManagementScreen.jsx`, `src/screens/automate/BatchImport.jsx`, `src/components/ConfirmDialog.jsx` callers (`BerthingForm.jsx`, `BerthingRecords.jsx`, `ContainerForm.jsx`, `GeneralCargoForm.jsx`, `ReceiptArchive.jsx`).

**Root cause for C4:** `UserManagementScreen.handleToggleActive` and `handleDelete` use browser `window.confirm`/`window.alert`. Electron loses input focus on the calling BrowserWindow after — user must Alt-Tab to interact again.

**Changes:**
1. Add IPC handler in `electron/main.js`:
   ```js
   ipcMain.handle('dialog:confirm', async (event, { title, message, detail, type = 'question' }) => {
     const win = BrowserWindow.fromWebContents(event.sender)
     const result = await dialog.showMessageBox(win, {
       type, title, message, detail,
       buttons: ['OK', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true,
     })
     return result.response === 0
   })
   ipcMain.handle('dialog:message', async (event, { title, message, detail, type = 'info' }) => {
     const win = BrowserWindow.fromWebContents(event.sender)
     await dialog.showMessageBox(win, {
       type, title, message, detail, buttons: ['OK'], noLink: true,
     })
     return true
   })
   ```
2. Expose in `preload.js`:
   ```js
   dialogConfirm: (opts) => ipcRenderer.invoke('dialog:confirm', opts),
   dialogMessage: (opts) => ipcRenderer.invoke('dialog:message', opts),
   ```
3. In `UserManagementScreen.jsx`, replace `window.confirm(...)` with `await window.api.dialogConfirm({ title: t('confirm'), message: confirmMsg })` and `window.alert(...)` with `await window.api.dialogMessage(...)`.
4. In `BatchImport.jsx:682` replace `window.confirm(t('batch_confirm_remove_reviewed'))` similarly.
5. For `ConfirmDialog.jsx` usages, replace custom modals with `window.api.dialogConfirm`. Either delete `ConfirmDialog.jsx` or leave only as fallback.

**Risk:** Medium — every call site goes async. Native dialogs are not stylable (acceptable; user explicitly requested Windows-native).
**Reload:** Full restart (main.js + preload.js changed).

---

### C1 — Disable login button when fields empty

**File:** `src/screens/Login.jsx`.

**Change:** Submit button `disabled={loading || !username.trim() || !password}` (currently only `loading`).

**Risk:** Trivial. Reload: Ctrl+R.

---

### D3 — OS local timezone display

**Files:** new `src/logic/formatDate.js`; consumers: `src/screens/users/UserManagementScreen.jsx` (fmtDate), `src/screens/audit/AuditLogScreen.jsx`, `src/screens/receipt/ReceiptArchive.jsx`, plus any timestamp shown in records screens.

**Root cause:** DB stores UTC via `datetime('now')`. UI displays raw UTC string (e.g. `UserManagementScreen.fmtDate` slices `ts.slice(0, 16).replace('T', ' ')` — no TZ conversion). Note `getPresence` correctly appends `'Z'` already.

**Changes:**
- Create `src/logic/formatDate.js`:
  ```js
  export function formatLocal(ts, opts = {}) {
    if (!ts) return ''
    const date = new Date(ts.includes('Z') ? ts : ts + 'Z')
    return date.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      ...opts,
    })
  }
  ```
- Replace inline timestamp formatters across the listed screens with `formatLocal(ts)`.

**Risk:** Low. Confirm every timestamp originates from `datetime('now')` (UTC) so the `'Z'` assumption holds. Reload: Ctrl+R.

---

### B4 (study) — AI uncertainty analysis

**Deliverable:** `docs/ai-uncertainty-analysis.md`. No code change.

**Document these findings (verified in code):**

Uncertainty has TWO independent sources:

1. **Model-side:** `electron/handlers/ai.js` EXTRACTION_PROMPT instructs Claude to populate `uncertain_fields`. Prompt explicitly tells model NOT to flag when it successfully infers position, when overtime is zero/empty, when value found, etc.

2. **Client-side (BIGGEST false-positive driver):** `src/logic/automateImport.js`, `buildReviewState`:
   - Line 110: `_uncertain: uncertain?.has('services') || !mc || !ctype` — flags ANY service line whose code isn't in the seeded DB list (`!mc`) OR is missing container size (`!ctype`), regardless of model confidence.
   - Line 130: same `!mc` flag for GC codes.

**Proposed improvements (feed into B5):**
- Distinguish "model unsure" from "code not in our DB list" — separate visual indicators.
- Soften `!ctype` to default to `'20ft'` rather than flag as uncertain.
- Consider auto-seeding unknown codes (admin review).
- Show specific reason per field ("AI was unsure" vs "Code not in catalog").

---

### B5 — Per-field uncertainty messages (replaces generic banner)

**Files:** `src/screens/automate/AutomateScreen.jsx`, `src/i18n/en.json` + `ar.json`. Depends on B4.

**Changes:**
- Per-field amber border + `⚠` already exists via `UncWarn` / `.field-uncertain`. Add an inline help text under each flagged field describing the specific reason ("AI couldn't read this — please verify" vs "Code not in catalog — confirm or pick from list").
- Remove or de-emphasize generic blocking banner (`import_uncertain_fields_blocking` in `AutomateScreen.jsx:583`).
- For service lines, show per-line inline message replacing the row-level `_uncertain` amber background hint.
- Categorize source per B4: use a new field on the line `_uncertainReason: 'model' | 'unknown_code' | 'missing_ctype'` instead of boolean `_uncertain`. Update `buildReviewState` in `automateImport.js`.

**i18n keys needed:** `uncertain_reason_model`, `uncertain_reason_unknown_code`, `uncertain_reason_missing_ctype`.

**Risk:** Medium. Reload: Ctrl+R.

---

### B1 + B2 + B3 + B6 + B10 (merged) — Automate page consolidation

**Files:** `src/screens/automate/AutomateScreen.jsx` (major simplification), `src/screens/automate/BatchImport.jsx`, `src/logic/batchGrouping.js`, i18n.

**Goal:** One unified page using BatchImport as the main UI. Single file → one-page group. No separate "single import" mode.

**B1 — Merge into one page:**
- In `AutomateScreen.jsx`: remove the `'upload'` phase entirely — the page queue UI, `pageQueue` state, `handleAddPage`, `handleProcessAll`, the queue processing overlay, the "Batch Import" entry button.
- Set initial `phase` to `'batch'`; `batchActive` always true.
- Mount `<BatchImport>` always; review phase still works via existing `openBatchGroupReview` / `batchRef.current.resolveGroup`.
- The exitBatch action now becomes startOver (no separate single mode to return to).
- Keep `DocumentImport.jsx` intact — it is still used standalone in `BerthingForm.jsx`.

**B2 — Fix drag-drop, remove "Merge with Previous":**
- Remove the merge button in `BatchImport.jsx:450-460` and the `mergeWithPrevious` import.
- Either delete `mergeWithPrevious` from `batchGrouping.js` or leave it unused.
- Harden drag-drop: read dragged page id from `dataTransfer.getData('text/plain')` as fallback to `dragPageRef.current`. Ensure page-level `onDrop` correctly `stopPropagation`s and group-level only fires when dropped outside a page card. Test drag from group A to group B, and reordering within a group.

**B3 — Larger hover preview:**
- In `BatchImport.jsx:313-326` (hoverPreview overlay) increase img to `width: 640px, maxHeight: 85vh, height: auto`.
- In `onMouseEnter` at lines 494-498, clamp top/left to viewport: if `rect.right + 660 > window.innerWidth`, anchor to `rect.left - 660`; if `rect.top + previewHeight > window.innerHeight`, shift up.

**B6 — Remove All button:**
- In step `'select'`, near the "files count" header, add a "Remove All" button that calls `setFiles([])` and `setGroups([])`.
- New i18n key: `batch_remove_all`.

**B10 — Accept (✓) button on review tabs:**
- In `BatchImport.jsx` summary step, for groups with `status: 'needs_review'`, add a ✓ button beside the existing × that:
  - Re-runs `validateReviewData(group.review.form, group.review.berthingRows, breakdowns)`.
  - If errors exist: show native dialog (D1) "Cannot accept — required fields missing".
  - If valid: call `insertVoyage({ form, validRows, serviceLines, manualLines: [], userId: session.id })`, then `autoSaveReceipt`, then update group status to `'done'` (same code path as auto-insert in `startProcessing`).
- New i18n key: `batch_accept_ai`.

**Risk:** Medium. Heavy refactor. Manual testing needed for drag-drop. Reload: Ctrl+R.

---

### B8 + B9 (merged) — Concurrent AI processing + per-receipt progress

**Files:** `src/screens/automate/BatchImport.jsx`, optional `docs/ai-uncertainty-analysis.md` (append a section).

**B9 finding (document):** `aiExtract` is an independent `fetch` POST to Anthropic per group; no streaming so per-call progress is simulated. Parallel extraction is safe with bounded concurrency. Anthropic rate limits apply (RPM/TPM depending on tier) — cap concurrency at 3. PDF auto-export MUST stay sequential (the `<ReceiptPreview>` overlay uses a single shared `pdfResolveRef`).

**Changes:**
- Rewrite `startProcessing()`:
  - Stage 1 (parallel, concurrency=3): for each group, run `aiExtract` + `buildReviewState` + `validateReviewData`. Set `status: 'processing'` at start, `status: 'needs_review' | 'ready_to_insert' | 'error'` at end. Use a simple promise pool (process N groups concurrently).
  - Stage 2 (sequential): for each `ready_to_insert` group, call `insertVoyage` → `autoSaveReceipt` → mount `<ReceiptPreview>` for PDF export (serial via existing `pdfResolveRef`).
- Per-receipt progress (B8): each group gets a `progress` field (0–100). While `status === 'processing'`, simulate via `setInterval` (same `current += (90 - current) * 0.07` pattern as `DocumentImport.jsx:87`). On stage 2 success, jump to 100.
- Render per-group progress bar in the group list during `step === 'process'`, replacing the single overall bar (keep overall bar at top as a summary).
- Add a `MAX_CONCURRENT = 3` constant at top of file.

**Risk:** Medium. Watch for race conditions with `setGroups` patches — use functional updater `setGroups(prev => prev.map(...))`. Rate-limit errors (HTTP 429) should mark the group as `'error'` with retry hint, not crash the batch. Reload: Ctrl+R.

---

### B11 — "View Receipt" after save

**Files:** `src/screens/automate/AutomateScreen.jsx` (done phase), `src/screens/berthing/BerthingRecords.jsx`, `src/screens/container/ContainerForm.jsx`, `src/screens/generalcargo/GeneralCargoForm.jsx`, i18n.

**Note:** `BatchImport.jsx:674` already does this correctly with `batch_view_receipt` key. Reuse.

**Changes:**
- After receipt save, switch button label from `t('generate_receipt')` to `t('view_receipt')` and route to `handleViewReceipt(voyageNumber)` (read-only) instead of `handleGenerateReceipt(voyageNumber)`.
- Need to detect "receipt exists for this voyage". Options:
  - Cheap: pass a flag down from `autoSaveReceipt`'s success.
  - For record screens (Berthing/Container/GC), add a small IPC `receipt:existsForVoyage(voyageNumber)` returning boolean OR derive from `receiptGetAll()` filtered by voyage_number + `!is_deleted`.
- Recommended: add `receiptHandlers.existsForVoyage(voyageNumber)` in `electron/database/handlers/receipts.js`:
  ```js
  function existsForVoyage(voyageNumber) {
    const row = db.prepare(
      `SELECT 1 FROM receipts WHERE voyage_number = ? AND is_deleted = 0 LIMIT 1`
    ).get(voyageNumber)
    return { success: true, exists: !!row }
  }
  ```
  Register IPC `receipt:existsForVoyage` in main.js + preload as `receiptExistsForVoyage`.
- Use existing i18n key `batch_view_receipt` or add `view_receipt`.

**Risk:** Low-medium. Reload: full restart (handler added).

---

### C3 + D2 (merged) — Super-admin + profile fields/avatar + pin self

**Files:** `electron/database/schema.js`, `electron/database/handlers/users.js`, `electron/database/handlers/auth.js`, `electron/main.js`, `electron/preload.js`, `src/context/SessionContext.jsx`, `src/screens/users/UserManagementScreen.jsx`, i18n.

**Schema migrations (additive, try/catch, in `schema.js` after existing column migrations):**
```js
try { db.exec(`ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN avatar_path TEXT`) } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN email TEXT`) } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`) } catch {}
```

**Seed reserved super-admin (one-time, after default admin seed):**
```js
const SUPERADMIN_USERNAME = 'vendor_support'  // reserved, hidden
try {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(SUPERADMIN_USERNAME)
  if (!existing) {
    const hash = bcrypt.hashSync('CHANGE_ME_VENDOR', 10)
    db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, language, must_change_password, is_superadmin, is_active)
      VALUES (?, 'Vendor Support', ?, 'admin', 'en', 0, 1, 1)
    `).run(SUPERADMIN_USERNAME, hash)
  }
} catch {}
```
(Document the seed password in this file or a separate vendor-only doc, then change after first deploy.)

**Guards in `users.js`:**
- `getAll()` — add `WHERE is_superadmin = 0` to the SELECT.
- `update`, `setActive`, `resetPassword`, `deleteUser`, `setPermission`: at the top, check target's `is_superadmin`; if 1, return `{ success: false, error: 'cannot_modify_superadmin' }`.
- `auth.login` works as-is for super-admin (allow login).

**Profile (D2):**
- Add `users.updateProfile(userId, { full_name, email, phone })` handler — separate from `update` (which is admin-only edit of others).
- Add avatar upload IPC in `main.js`:
  ```js
  ipcMain.handle('users:uploadAvatar', async (event, { userId, base64, ext }) => {
    const dir = 'C:\\ShipFees\\avatars'
    await fs.promises.mkdir(dir, { recursive: true })
    const filename = `${userId}_${Date.now()}.${ext}`
    const filepath = path.join(dir, filename)
    await fs.promises.writeFile(filepath, Buffer.from(base64, 'base64'))
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(filepath, userId)
    return { success: true, path: filepath }
  })
  ```
- Expose `usersUpdateProfile`, `usersUploadAvatar` in `preload.js`.
- `auth.login` must return `avatar_path`, `email`, `phone` in the user object so `SessionContext` carries them.

**UI changes in `UserManagementScreen.jsx`:**
- Above the user table, render a "Your Profile" card pinned to top showing the current `session` user — username, avatar (img if `avatar_path` exists), full name, email, phone, language. With an "Edit Profile" button opening a new modal (`ProfileDialog`) using `usersUpdateProfile` + `usersUploadAvatar`. Avatar picker: hidden `<input type="file" accept="image/*">`, read as base64, pass to IPC.
- Filter the main table to exclude the current user (already in the pinned card).
- Avatars in the table: small thumbnail (32x32 rounded) if `avatar_path` exists, otherwise initials placeholder.

**Display of avatars in renderer:** avatar files live outside the app bundle. Use `file://` URLs or load as base64 via a small IPC `users:getAvatarBase64(userId)` to avoid CSP issues with `file://`. Recommended: add IPC that reads the file and returns base64; render as `<img src="data:image/...;base64,...">`.

**i18n keys:** `your_profile`, `edit_profile`, `email`, `phone`, `upload_avatar`, `cannot_modify_superadmin`, etc.

**Risk:** Medium-large. Avatar storage and CSP. Auth payload change ripples to anywhere using session. Reload: full restart.

---

### E1 — Usage statistics table + handler

**Files:** `electron/database/schema.js`, new `electron/database/handlers/stats.js`, `electron/main.js`, `electron/preload.js`.

**Schema (add to `schema.js`):**
```sql
CREATE TABLE IF NOT EXISTS usage_stats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id),
  username     TEXT,
  action_type  TEXT NOT NULL,
  api_endpoint TEXT,
  detail       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_stats_created ON usage_stats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user    ON usage_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_stats_action  ON usage_stats(action_type);
```

**`action_type` values (controlled vocabulary):**
`login`, `logout`, `password_change`, `ai_extract`, `receipt_generated`, `receipt_deleted`, `berthing_created`, `berthing_updated`, `berthing_deleted`, `container_saved`, `gc_saved`, `cma_exported`, `user_created`, `user_updated`, `user_deleted`, `user_disabled`, `user_enabled`, `permission_changed`, `storage_saved`, `batch_import`.

**Handler `electron/database/handlers/stats.js`:**
```js
function log({ user_id, username, action_type, api_endpoint, detail }) {
  try {
    db.prepare(`
      INSERT INTO usage_stats (user_id, username, action_type, api_endpoint, detail)
      VALUES (?, ?, ?, ?, ?)
    `).run(user_id || null, username || null, action_type, api_endpoint || null, detail ? JSON.stringify(detail) : null)
    return { success: true }
  } catch (err) { return { success: false, error: err.message } }
}

function getStats({ user_id, action_type, date_from, date_to, limit = 100, offset = 0 } = {}) {
  // mirror audit.getEntries pattern: build WHERE, return { success, data, total }
}
```

**IPC in `main.js`:**
```js
ipcMain.handle('stats:log',      (_, payload) => statsHandlers.log(payload))
ipcMain.handle('stats:getStats', (_, filters) => statsHandlers.getStats(filters))
```

**Preload:**
```js
statsLog:      (payload) => ipcRenderer.invoke('stats:log', payload),
statsGetStats: (filters) => ipcRenderer.invoke('stats:getStats', filters),
```

**Targeted logging (NOT a generic wrapper — avoids logging every read/heartbeat):**
- In `auth.login` (success branch): `statsHandlers.log({ user_id: user.id, username: user.username, action_type: 'login' })`.
- In `auth.logout`: log `logout`.
- In `auth.changePassword`: log `password_change`.
- In `ai.extract` (success branch): log `ai_extract` with detail `{ pages: images.length }` — needs user_id passed from renderer (modify `ai:extract` IPC signature to accept `{ images, userId }`).
- In `receipts.saveReceipt`: log `receipt_generated`.
- In `receipts.softDelete`: log `receipt_deleted`.
- In `berthing.save` / `update` / `softDelete`: log respective action.
- In `container.saveSession`, `gc.saveSession`: log `container_saved` / `gc_saved`.
- In `cma:exportExcel` handler: log `cma_exported`.
- In `users.create/update/setActive/deleteUser/resetPassword/setPermission`: log respective action with `user_id: admin_id` (the actor).
- In `audit.logImport`: also log `batch_import`.
- In `storage.saveRecord/updateRecord/softDelete`: log respective action.

For handlers that don't currently receive userId, modify their renderer call site to pass it (existing pattern with `created_by`/`adminId`).

**Risk:** Medium. Don't log every IPC — only meaningful events. Logging failures must not break primary action (wrap in try/catch, swallow). Reload: full restart.

---

### E2 — Statistics & Usage screen (admin + manager)

**Files:** new `src/screens/users/StatisticsScreen.jsx`, `src/screens/MainApp.jsx`, `src/components/Sidebar.jsx`, i18n.

**Routing:**
- Add `'statistics'` case in `MainApp.renderScreen()` with guard:
  ```js
  case 'statistics':
    if (session?.role !== 'admin' && session?.role !== 'manager') return <Home setCurrentScreen={setCurrentScreen} />
    return <StatisticsScreen />
  ```
- Sidebar (`Sidebar.jsx`): add `{ key: 'statistics', icon: '📈', label: 'statistics_usage' }` to both `adminNavItems` and `managerNavItems`.

**Screen `StatisticsScreen.jsx` (mirror AuditLogScreen.jsx structure):**
- Filter controls: User dropdown (loaded from a small `users:getAll` call), Action Type dropdown (hardcoded vocabulary from E1), Date Range (date_from + date_to).
- Pagination: PAGE_SIZE = 50.
- Table columns: Timestamp (use `formatLocal` from D3), Username, Action Type, API Endpoint, Detail (expandable JSON cell).
- Call `window.api.statsGetStats(filters)` on mount + filter change.

**i18n keys:** `statistics_usage`, `stat_action_type`, `stat_endpoint`, `stat_detail`, plus a label per `action_type` value (e.g. `stat_action_login`, `stat_action_ai_extract`).

**Risk:** Medium. Depends on E1. Reload: Ctrl+R (no main-process change).

---

### C2 (study) — Saved credentials / Windows SSO

**Deliverable:** `docs/login-sso-study.md`. No code.

**Sections to write:**

1. **Option A — Remember-me with encrypted credential storage:**
   - Use Electron `safeStorage` (Windows DPAPI under the hood).
   - Store an opaque login token in `%APPDATA%\Ship Fees\auth.dat` (encrypted).
   - DB: add `remember_token TEXT` column on `users`; rotate on each login.
   - Renderer: "Remember me" checkbox on Login.jsx; on next launch, main-process auto-attempts token login.
   - Never store plaintext passwords.

2. **Option B — Windows username matching (lightweight SSO):**
   - DB: add `windows_username TEXT` column on `users`.
   - Main process reads `os.userInfo().username` at boot.
   - If a user exists with that `windows_username` AND `is_active = 1`, auto-login.
   - Admin UI to map app users to Windows usernames (in User Management edit dialog).
   - Trade-off: trust boundary = whoever owns the Windows session owns that mapped app account. Acceptable for a single-office trusted-staff deployment.

3. **Option C — True AD/Kerberos SSO:**
   - Use `node-sspi` (native module) for NTLM/Kerberos handshake.
   - Heavy dep, requires AD setup, native build per arch.
   - Recommend only if Port has Active Directory and wants enterprise SSO. Document but do not implement.

4. **Recommendation:** Implement A + B together. A handles roaming users / personal preference. B handles dedicated workstations. C deferred unless enterprise need emerges.

5. **DB changes summary:** `remember_token TEXT`, `windows_username TEXT`. Both additive.

6. **Security notes:** safeStorage tied to Windows user account — moving the auth.dat to another machine/account fails to decrypt (good). Token rotation on each login. Logout clears the token file.

7. **Implementation effort estimate:** A ≈ 1 session, B ≈ 0.5 session, C ≈ 2+ sessions with deployment complexity.

---

## Notes on Translations

Every new i18n key listed above MUST exist in both `src/i18n/en.json` and `src/i18n/ar.json`. Arabic values can be added as placeholders if translation is pending, but the key must exist or `t()` will return the key string.

## Notes on Client Mode

`electron/client.js` and `electron/server.js` are a parallel HTTP layer for multi-machine deployment. NEW handlers do NOT need to be wired through client mode unless explicitly required — audit and heartbeat are already local-only. Default: skip client wiring for new features (matches existing precedent).

## Definition of Done per Task

- All listed files updated.
- All new i18n keys present in both `en.json` and `ar.json`.
- Reload instruction stated in the response ("Force-reload (Ctrl+R)" or "Full restart (npm run dev)").
- No `DELETE` SQL anywhere — soft deletes only.
- Audit log entry written for any new mutation.
- Money/numbers in UI use `className="num-ltr"`.
