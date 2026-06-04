# Ship Fees Desktop App — Claude Context

Windows desktop app for Port of Beirut staff. Replaces `ShipFees.xlsm`. Calculates berthing fees, records cargo services, generates receipts, and supports AI document import.

---

## Tech Stack

- **Electron** + **React** (plain JS, no TypeScript) + **Vite** (renderer on :5173)
- **better-sqlite3** — synchronous SQLite, main process only
- **i18next** — Arabic / English, full RTL support
- **Tailwind CSS** (via CDN-style imports, not PostCSS)
- **bcryptjs** — password hashing
- **electron-builder** — Windows NSIS installer output to `dist-app/`
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
  database/
    db.js                        better-sqlite3 connection singleton
    schema.js                    CREATE TABLE, seed data, startup migrations
    handlers/
      berthing.js                Berthing CRUD + upsert logic
      container.js               Container services; replaceUserLines flag; extra STAMP guard
      gc.js                      GC services; replaceUserLines flag
      receipts.js                getDataForReceipt, saveReceipt, getAll, softDelete
  handlers/
    ai.js                        Claude API vision call (claude-sonnet-4-6, max_tokens 4096)
    settings.js                  Reads/writes C:\ShipFees\config\settings.json

src/
  logic/
    berthingCalc.js              Pure berthing fee calculation (no IPC)
    receiptCalc.js               Pure receipt engine (no IPC) — see rules below
  context/
    SessionContext.jsx           Session + rates loaded once after login
  screens/
    automate/AutomateScreen.jsx  3-phase AI import: Upload → Review → Done
    berthing/BerthingForm.jsx    Berthing entry form
    berthing/BerthingRecords.jsx Records table, edit/soft-delete
    container/ContainerScreen.jsx
    generalcargo/GeneralCargoScreen.jsx
    receipt/ReceiptPreview.jsx   Full-screen overlay via React createPortal
    receipt/ReceiptArchive.jsx   Archive list
    settings/SettingsScreen.jsx  Admin only — API key management
    MainApp.jsx                  Routing + receiptState for overlay
  components/
    DocumentImport.jsx           File picker, PDF rasterization, sends base64 to main
    SearchableSelect.jsx
    Sidebar.jsx
  i18n/
    en.json / ar.json            All UI strings
```

---

## Database

**Location:** `C:\ShipFees\data\ship_fees.db` (created on first launch)

**Tables:** `users`, `berthing_records`, `audit_log`, `berthing_rates`, `berthing_minimums`, `vessel_categories`, `shipping_agents`, `voyages`, `gc_codes`, `gc_services`, `container_codes`, `container_services`, `receipts`

**Voyage # is the hub** — all billing records link by `voyage_number` text key.

### Column migrations (run on every startup via try/catch)
```js
try { db.exec(`ALTER TABLE container_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE gc_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE receipts ADD COLUMN nbr_of_stamps INTEGER NOT NULL DEFAULT 0`) } catch {}
```

---

## Hard Rules — Always Follow

- **Soft deletes only** — `UPDATE ... SET is_deleted = 1`. Never `DELETE`.
- **Audit log** — every INSERT, UPDATE, soft-delete writes to `audit_log` with old/new JSON.
- **IPC pattern** — renderer never touches DB. No exceptions.
- **API key** — stored in `C:\ShipFees\config\settings.json`, listed in `.gitignore`. Never hardcoded.
- **No Zod on receipts handler** — simple direct inserts only.
- **Bilingual** — every new UI string needs a key in both `en.json` and `ar.json`.
- **Financial numbers** — always `dir="ltr"` even in Arabic mode (use `className="num-ltr"`).

---

## Berthing Fee Calculation (`berthingCalc.js`)

- LOA → L_index (1–4)
- Tiered daily rates: D1 (days 1–3), D2 (days 4–10), D3 (days 11+)
- Positions: **Quay** (D1/D2/D3 rates), **P2** (single flat rate), **En Rade** (single flat rate)
- **Pos 3 / P3** = free anchorage, no fee — filtered out entirely at Automate import, never saved as a berthing record
- Vessel category discounts (Lebanese 50%, Military 0%, etc.)
- Optional maintenance surcharge

---

## Receipt Calculation (`receiptCalc.js`)

Entry point: `calculateReceipt({ berthingRows, serviceRows, moduleType })`

### Line filtering (applied first, before any categorization)
- **RS lines** — `service_code.startsWith('RS')` → silently excluded from all totals and display
- **OT lines** — `/-E$/i.test(code) || /OT|OVERT/i.test(code)` → always treated as regular lines regardless of `is_taxable` flag

### GC vs Container branching

| | GC | Container |
|---|---|---|
| Tax block | ✅ shown | ❌ hidden |
| STAMP treatment | Taxable (in taxableSubtotal) | Fixed (in fixedTotal) |
| fixedTotal | AUTOM + BILLF | AUTOM + BILLF + all STAMP lines |
| Container Tax | — | $0.22 added to freshAmount |
| STAMP auto lines | 1 line: qty=1, $2.00 | 2 lines: qty=1 $2.00 + qty=3 $6.00 = $8.00 total |

### Formulas
```
price             = berthingTotal + regularLines total
fundable          = min(price × 0.035, $450)
rehabFee          = (taxableSubtotal − 2) × 0.03511111   [GC only; $0 if fundable capped]
totalTax          = ((0.11 × taxableSubtotal − 0.22) × 0.035) + 0.11 × taxableSubtotal   [GC only]
freshAmount       = price + fundable + fixedTotal + taxableSubtotal + totalTax + containerTax
finalPrice        = Math.ceil(freshAmount)   [any decimal → round up; whole numbers unchanged]
```

**Fundable cap:** if `fundable >= $450`, Rehabilitation Fee is excluded entirely.

---

## Auto System Lines

### GC (inserted once per voyage, `saveSession`)
| Code | Qty | Rate | Total | is_fixed | is_auto |
|---|---|---|---|---|---|
| AUTOM | 1 | $1.00 | $1.00 | 1 | 0 |
| BILLF | 1 | $1.00 | $1.00 | 1 | 0 |
| STAMP | 1 | $2.00 | $2.00 | 0 | 1 |

### Container (two separate guards)
| Code | Qty | Rate | Total | Guard |
|---|---|---|---|---|
| AUTOM | 1 | $1.00 | $1.00 | `hasAutoLines` |
| BILLF | 1 | $1.00 | $1.00 | `hasAutoLines` |
| STAMP | 1 | $2.00 | $2.00 | `hasAutoLines` |
| STAMP | 3 | $2.00 | $6.00 | `hasExtraStamp` (separate — backfills existing voyages) |

---

## Automate Screen (AI Import)

3-phase flow: **Upload → Review → Done**

- Accepts PDF, JPG, PNG (max 8MB)
- PDF rasterized in renderer via pdfjs-dist (scale 1.5, JPEG 0.82), max 4 pages
- Base64 sent to main process → Claude vision API (`ai:extract` IPC)
- Review screen: all fields editable, uncertain fields highlighted amber ⚠
- Multi-position berthing: multiple rows, Add Row / Remove Row

### Import-time filters (before review screen)
- **RS service codes** — filtered out (`service_code.startsWith('RS')`)
- **Pos 3 / P3 berthing rows** — filtered out (`FREE_POSITION_KEYS = { P3, POS3, POS_3 }`)

### Save behavior
- **Berthing:** upsert by index — finds existing records for voyage, calls `updateBerthing` instead of `saveBerthing` to prevent duplicates
- **Services:** `replaceUserLines: true` — soft-deletes existing user lines (not auto/fixed) before inserting new ones

### POSITION_MAP (alias normalization)
```
QUAY / POS1 / POS_1 / P1  →  Quay
P2 / POS2 / POS_2          →  P2
EN RADE / ENRADE / EN-RADE →  En Rade
P3 / POS3 / POS_3          →  FREE (filtered out, not a paying position)
```

---

## PDF Export

`receipt:exportPDF` IPC → `webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'printableArea' } })`

- No external PDF libraries
- `@media print` uses `position: static` (not fixed — `position: fixed` clips to one viewport height)

---

## Module Status

| Module | Status |
|---|---|
| Berthing | ✅ Complete |
| Container Services | ✅ Complete |
| General Cargo Services | ✅ Complete |
| Receipt Generation + PDF Export | ✅ Complete |
| Receipt Archive | ✅ Complete |
| AI Document Import (Automate) | ✅ Complete |
| Settings (API key mgmt) | ✅ Complete |
| Storage | 🔲 Not started |
| CMA Receipt | ✅ Complete |
| User Management | 🔲 Not started |
| Rates/Tariff Editor | 🔲 Not started |
