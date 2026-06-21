# Ship Fees Desktop App — Claude Context

Windows desktop app for Port of Beirut staff. Replaces `ShipFees.xlsm`. Calculates berthing fees, records cargo services, generates receipts, and supports AI document import.

---

## Tech Stack

- **Electron 29** + **React 18** (plain JS, no TypeScript) + **Vite 5** (renderer on :5173)
- **better-sqlite3** — synchronous SQLite, main process only
- **i18next** — Arabic / English, full RTL support
- **Tailwind CSS** (PostCSS)
- **bcryptjs** — password hashing
- **Express** — REST server on :3001 (server mode)
- **xlsx (SheetJS)** — Excel export (CMA)
- **date-fns** — date math
- **electron-builder** — Windows NSIS installer → `dist-app/`
- **pdfjs-dist** — PDF rasterization in renderer (needs Chromium Canvas)

---

## Architecture — IPC Pattern (NEVER break this)

```
Renderer (React)  →  window.api.someMethod(data)
                  →  IPC invoke  →  main.js handler  →  better-sqlite3
```

- The renderer **never** touches the database directly
- All DB operations go through `preload.js` → `main.js` → `handlers/`
- All API calls (Claude AI) go through the main process — key never exposed to renderer/DevTools
- `window.api` is the only bridge — defined in `preload.js` via `contextBridge`

**Two modes** (set in `%APPDATA%\Ship Fees\config.json`):
- **Server mode (default):** local SQLite + Express on :3001
- **Client mode:** all IPC proxied by `electron/client.js` → `POST http://{serverUrl}/api/...` with `x-token` header. Known gap: Storage endpoints missing from `server.js` → client-mode storage 404s.

---

## Dev & Build

```
npm install && npm run dev   # Vite :5173 + Electron window
npm run build                # Windows .exe installer → dist-app/
```

Default login: `admin` / `admin123` (forces password change on first login)

---

## Key File Map

```
electron/
  main.js                        All IPC handlers registered here
  preload.js                     contextBridge — window.api surface
  server.js                      Express REST server :3001 (for server-mode peers)
  client.js                      HTTP proxy — routes all IPC through server in client mode
  configStore.js                 Reads %APPDATA%\Ship Fees\config.json → { mode, serverUrl, token }
  database/
    db.js                        better-sqlite3 singleton
    schema.js                    CREATE TABLE, seeds, startup migrations
    handlers/
      auth.js                    login, changePassword, logout
      berthing.js                Berthing CRUD + upsert
      container.js               Container services; replaceUserLines; STAMP guard
      gc.js                      GC services; replaceUserLines
      receipts.js                getDataForReceipt, saveReceipt, getAll, softDelete, prepareBerthingOnly
      cma.js                     getReport, getVoyageDetail (TEU aggregation by agent/month)
      users.js                   CRUD + permissions (getAll, create, update, resetPassword, setActive, setPermission, deleteUser, heartbeat)
      audit.js                   getEntries, getFilterOptions, logImport
      storage.js                 getAll, getById, saveRecord, updateRecord, softDelete
  handlers/
    ai.js                        Claude API vision call (claude-sonnet-4-6, max_tokens 4096)
    settings.js                  Reads/writes C:\ShipFees\config\settings.json

src/
  logic/
    berthingCalc.js              Pure berthing fee calculation
    receiptCalc.js               Pure receipt engine — see rules below
    automateImport.js            Shared AI-import pipeline: buildReviewState, insertVoyage, autoSaveReceipt
    batchGrouping.js             buildGroups, movePage, splitPage, mergeWithPrevious
    storageCalc.js               Storage fee calc (6 cargo types)
  context/
    SessionContext.jsx           Session + rates + heartbeat (60s interval)
  screens/
    MainApp.jsx                  Routing hub (pure useState, no router library)
    automate/AutomateScreen.jsx  Single-import 3-phase: Upload → Review → Done
    automate/BatchImport.jsx     Batch 4-step: Select → Group → Process → Summary
    berthing/                    BerthingForm, BerthingRecords
    container/ContainerScreen.jsx
    generalcargo/GeneralCargoScreen.jsx
    receipt/ReceiptPreview.jsx   Full-screen overlay via React createPortal
    receipt/ReceiptArchive.jsx   Archive list
    cma/CMAScreen.jsx            CMA report + Excel export
    users/UserManagementScreen.jsx   Admin CRUD (roles, permissions, reset password)
    users/ManagerStaffScreen.jsx     Manager read-only presence view (refreshes 30s)
    audit/AuditLogScreen.jsx     Paginated audit log with filters (admin only)
    voyageservices/              Tabbed Berthing + Container + GC view
    storage/                     StorageScreen, StorageCalculator, StorageRecords
    settings/SettingsScreen.jsx  Admin only — API key management
  components/
    DocumentImport.jsx           File picker, PDF rasterization (max 20 pages)
    SearchableSelect.jsx
    Sidebar.jsx / TopBar.jsx
  i18n/
    en.json / ar.json            All UI strings
```

---

## Database

**Location:** `C:\ShipFees\data\ship_fees.db`

**Tables (15):** `users`, `berthing_records`, `audit_log`, `berthing_rates`, `berthing_minimums`, `vessel_categories`, `shipping_agents`, `voyages`, `gc_codes`, `gc_services`, `container_codes`, `container_services`, `receipts`, `storage_records`, `user_permissions`

**Voyage # is the hub** — all billing records link by `voyage_number` text key.

### Startup migrations (try/catch on every launch)
```sql
ALTER TABLE container_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0
ALTER TABLE gc_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0
ALTER TABLE receipts ADD COLUMN nbr_of_stamps INTEGER NOT NULL DEFAULT 0
ALTER TABLE users ADD COLUMN created_by TEXT
ALTER TABLE users ADD COLUMN is_online INTEGER NOT NULL DEFAULT 0
ALTER TABLE users ADD COLUMN last_seen TEXT
ALTER TABLE berthing_records ADD COLUMN roro_cargo_type TEXT
ALTER TABLE users ADD COLUMN perm_storage INTEGER NOT NULL DEFAULT 0
ALTER TABLE users ADD COLUMN perm_automate INTEGER NOT NULL DEFAULT 0
ALTER TABLE users ADD COLUMN perm_cma INTEGER NOT NULL DEFAULT 0
```
Plus `writable_schema` patches for role CHECK expansion, Congestion position, vessel_type CHECK removal.

---

## User Management & Permissions

**Roles:** `admin`, `user`, `manager`

**Two-track permission system:**
- `users` table columns (flags): `perm_storage`, `perm_automate`, `perm_cma` — controls screen access
- `user_permissions` table (key strings): `generate_cma_receipt`, `edit_others_records`, `access_tariff_editor`
- `setPermission` dispatches to column UPDATE or table INSERT/DELETE based on which track

**Screen access (MainApp.jsx):**
- `storage`, `automate`, `cma` → admin OR matching `perm_*` flag = 1
- `audit_log`, `user_management` → admin only
- `staff_view` → manager only

**Guards:** can't disable own account · can't disable last active admin · can't delete user with records (disable instead).

**Presence (from `last_seen`):** Online < 3 min · Idle 3–30 min · Offline 30+ min.

---

## Reload Guidance — Always Tell the User

- **Force-reload** (`Ctrl+R` in Electron window) — `src/` changes (React, CSS, logic, i18n)
- **Full restart** (`npm run dev`) — `electron/` changes (main.js, preload.js, handlers/, database/)

Never assume the user knows — always say it, every time.

---

## Hard Rules — Always Follow

- **Soft deletes only** — `UPDATE ... SET is_deleted = 1`. Never `DELETE`.
- **Audit log** — every INSERT, UPDATE, soft-delete writes to `audit_log` with old/new JSON.
- **IPC pattern** — renderer never touches DB. No exceptions.
- **API key** — stored in `C:\ShipFees\config\settings.json`. Never hardcoded.
- **No Zod on receipts handler** — simple direct inserts only.
- **Bilingual** — every new UI string needs a key in both `en.json` and `ar.json`.
- **Financial numbers** — always `dir="ltr"` even in Arabic mode (use `className="num-ltr"`).

---

## Berthing Fee Calculation (`berthingCalc.js`)

```
lIndex = 1 + (loa > 75) + (loa > 125) + (loa > 175)   → range 1–4

Day tiers: D1 = min(days, 5)   D2 = min(max(days−5, 0), 10)   D3 = max(days−15, 0)

Quay:       rawFee = (d1 × R_D1[lIndex] + d2 × R_D2[lIndex] + d3 × R_D3[lIndex]) × loa
P2:         rawFee = days × R_P2[lIndex] × loa
En Rade:    rawFee = days × 1 × loa   (flat rate, changed 2026-06-18)
Congestion: rawFee = 0   (saved as $0 record)
P3:         → filtered out entirely, never billed
```

- Vessel discounts: Lebanese 50%, Military 0%, RoRo 35% off berthingTotal (applied at receipt level)
- Optional maintenance: `3 × days × loa`
- Minimum applied at receipt time via `applicableMinimum`, not per row

---

## Receipt Calculation (`receiptCalc.js`)

Entry point: `calculateReceipt({ berthingRows, serviceRows, moduleType })`

### Line filtering (applied first)
- **RS lines** — `service_code.startsWith('RS')` → excluded from all totals and display
- **OT lines** — `/-E$/i.test(code) || /OT|OVERT/i.test(code)` → always treated as regular lines regardless of `is_taxable`

### GC vs Container branching

| | GC | Container |
|---|---|---|
| Tax block | ✅ shown | ❌ hidden |
| STAMP treatment | Taxable (in taxableSubtotal) | Fixed (in fixedTotal) |
| fixedTotal | AUTOM + BILLF | AUTOM + BILLF + all STAMP lines |
| Container Tax | — | $0.22 added to freshAmount |
| STAMP auto lines | 1 line: qty=1, $2.00 | 1 line: qty=4, $8.00 |

### Formulas
```
berthingTotal = max(sum(feeAfterDiscount + maintenanceFee), applicableMinimum)
              − 35% RoRo discount if vesselType = RoRo
price         = berthingTotal + sum(regularLines)
fundable      = min(price × 0.035, $450)
rehabFee      = (taxableSubtotal − 2) × 0.03511111   [GC only; $0 if fundable capped]
totalTax      = ((0.11 × taxableSubtotal − 0.22) × 0.035) + 0.11 × taxableSubtotal   [GC only]
freshAmount   = price + fundable + fixedTotal + taxableSubtotal + totalTax + containerTax
finalPrice    = Math.ceil(freshAmount)
```

**Fundable cap:** if `fundable >= $450`, Rehabilitation Fee is excluded entirely.

---

## Auto System Lines

### GC (inserted once per voyage, `saveSession`)
| Code | Qty | Rate | is_fixed | is_auto |
|---|---|---|---|---|
| AUTOM | 1 | $1.00 | 1 | 0 |
| BILLF | 1 | $1.00 | 1 | 0 |
| STAMP | 1 | $2.00 | 0 | 1 |

### Container (single `hasAutoLines` guard)
| Code | Qty | Rate |
|---|---|---|
| AUTOM | 1 | $1.00 |
| BILLF | 1 | $1.00 |
| STAMP | 4 | $2.00 |

---

## Automate Screen (AI Import)

### Single import — 3-phase: Upload → Review → Done
- Accepts PDF, JPG, PNG (max 8MB); PDF max 20 pages rasterized at scale 1.5, JPEG 0.82
- `ai:extract` IPC → `claude-sonnet-4-6`, returns JSON; uncertain fields → amber ⚠
- Shared logic in `src/logic/automateImport.js`: `buildReviewState`, `insertVoyage`, `autoSaveReceipt`
- Save: berthing upserts by index; services use `replaceUserLines: true`
- Silent PDF export: `receipt:exportPDFBatch` → `C:\ShipFees\receipts\`

### Batch import — 4-step: Select → Group → Process → Summary
- `src/screens/automate/BatchImport.jsx` (forwardRef; parent calls `batchRef.current.resolveGroup(id, result)`)
- `src/logic/batchGrouping.js` — Samsung filename `YYYYMMDD_HHMMSS`; photos within 12s grouped as same receipt; falls back to `mtimeMs`
- Auto-inserts only when: zero uncertain fields + all codes matched + all required fields valid

### Import-time filters
- RS codes → dropped; P3/POS3/POS_3 berthing rows → dropped

### POSITION_MAP
```
QUAY / POS1 / POS_1 / P1                          → Quay
P2 / POS2 / POS_2                                  → P2
EN RADE / ENRADE / EN-RADE                         → En Rade
EN RADE FREE / CONGESTION / CONG / EN RADE LIBRE   → Congestion ($0, saved)
P3 / POS3 / POS_3                                  → FREE (filtered out)
```

---

## PDF Export

`receipt:exportPDF` → `webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'printableArea' } })`
- `@media print` uses `position: static` (not fixed — fixed clips to one viewport height)

---

## Module Status

| Module | Status |
|---|---|
| Berthing | ✅ Complete |
| Container Services | ✅ Complete |
| General Cargo Services | ✅ Complete |
| Receipt Generation + PDF Export | ✅ Complete |
| Receipt Archive | ✅ Complete |
| AI Document Import — Single | ✅ Complete |
| AI Document Import — Batch | ✅ Complete |
| CMA Receipt + Excel Export | ✅ Complete |
| User Management | ✅ Complete |
| Audit Log | ✅ Complete |
| Storage | ✅ Built (client-mode gap: storage endpoints missing from server.js → 404) |
| Settings (API key mgmt) | ✅ Complete |
| Rates/Tariff Editor | 🔲 Not started |
| Backup system | 🔲 Not started |
