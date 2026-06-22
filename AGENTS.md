# AGENTS.md — Ship Fees Desktop App

This file is persistent guidance for Codex when working in this repository.

## Project Identity

This is the **Ship Fees Desktop App** for Port of Beirut staff.

It replaces the old `ShipFees.xlsm` Excel workflow. The app calculates berthing fees, records cargo services, generates receipts, exports PDFs, and supports AI document import.

Normal users are non-technical office staff. Favor simple, obvious UI and minimal workflow friction over clever abstractions.

## Tech Stack

- **Electron** + **React**
- **Plain JavaScript only** — no TypeScript
- **Vite** renderer on `:5173`
- **better-sqlite3** — synchronous SQLite, main process only
- **i18next** — Arabic / English, full RTL support
- **Tailwind CSS** via CDN-style imports, not PostCSS
- **bcryptjs** — password hashing
- **electron-builder** — Windows NSIS installer output to `dist-app/`
- **pdfjs-dist** — PDF rasterization in renderer; needs Chromium Canvas
- **Claude vision API** for document scanning/import
- **sharp** for image compression before AI calls

## Development Commands

```bash
npm install
npm run dev
npm run build
```

- `npm run dev` starts Vite on `:5173` and opens the Electron window.
- `npm run build` creates the Windows `.exe` installer in `dist-app/`.

Default login:

```text
admin / admin123
```

The default admin login forces password change on first login.

## Core Architecture — Do Not Break

All renderer-to-database access must follow this pattern:

```text
Renderer React
  → window.api.someMethod(data)
  → IPC invoke
  → electron/main.js handler
  → electron/database/handlers/*
  → better-sqlite3
```

Rules:

- The renderer must **never** touch SQLite directly.
- All DB operations go through `preload.js` → `main.js` → database handlers.
- All API calls, especially Claude AI calls, must go through the Electron main process.
- API keys must never be exposed to renderer code, browser DevTools, React state, or frontend logs.
- `window.api` is the only bridge and must be defined in `preload.js` using `contextBridge`.

## Key File Map

```text
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
    ai.js                        Claude API vision call
    settings.js                  Reads/writes C:\ShipFees\config\settings.json

src/
  logic/
    berthingCalc.js              Pure berthing fee calculation; no IPC
    receiptCalc.js               Pure receipt engine; no IPC
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
    settings/SettingsScreen.jsx  Admin-only API key management
    MainApp.jsx                  Routing + receiptState for overlay
  components/
    DocumentImport.jsx           File picker, PDF rasterization, sends base64 to main
    SearchableSelect.jsx
    Sidebar.jsx
  i18n/
    en.json
    ar.json
```

## Database

Database path:

```text
C:\ShipFees\data\ship_fees.db
```

The database is created on first launch.

Important tables:

```text
users
berthing_records
audit_log
berthing_rates
berthing_minimums
vessel_categories
shipping_agents
voyages
gc_codes
gc_services
container_codes
container_services
receipts
```

`voyage_number` is the central text key linking billing records across modules.

### Startup Column Migrations

Startup migrations are run via guarded `try/catch` statements in `schema.js`.

Existing pattern:

```js
try { db.exec(`ALTER TABLE container_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE gc_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE receipts ADD COLUMN nbr_of_stamps INTEGER NOT NULL DEFAULT 0`) } catch {}
```

When adding schema changes:

1. Preserve existing data.
2. Use safe startup migrations.
3. Avoid breaking older local databases.
4. Explain why the schema change is required.
5. Update seed/init logic if needed.

## Hard Rules

Always follow these rules:

- **Soft deletes only**: use `UPDATE ... SET is_deleted = 1`; never hard-delete business records.
- **Audit log required**: every INSERT, UPDATE, and soft-delete must write to `audit_log` with old/new JSON when applicable.
- **IPC boundary required**: renderer never accesses the database directly.
- **API key security**: keys live in `C:\ShipFees\config\settings.json`; never hardcode or expose them.
- **No Zod on receipts handler**: receipts handler should use simple direct inserts.
- **Bilingual UI**: every new UI string needs keys in both `src/i18n/en.json` and `src/i18n/ar.json`.
- **Financial numbers**: numbers must remain LTR even in Arabic mode. Use `dir="ltr"` or `className="num-ltr"`.
- **Smallest safe change**: do not rewrite unrelated code or redesign unrelated screens.
- **No business-rule drift**: preserve existing billing rules unless explicitly asked to change them.

## Reload Guidance — Always Tell the User

After every change, explicitly state which reload is needed.

Use:

```text
Force-reload Electron window with Ctrl+R
```

for renderer-only changes:

- React components
- CSS
- `src/` logic
- i18n strings

Use:

```text
Fully restart npm run dev
```

for main-process changes:

- `electron/main.js`
- `electron/preload.js`
- `electron/database/*`
- `electron/handlers/*`

Do not assume the user knows which reload is needed. State it every time.

## UI Rules

Target users have low computer skill.

UI should be:

- Simple
- Large-click-target
- Obvious
- Minimal
- Plain-language
- Hard to misuse
- Low-risk for accidental data damage

Avoid:

- Dense admin-style interfaces for normal users
- Technical error messages
- Hidden dependencies between fields
- Unexplained abbreviations
- Clever UI that requires training

Arabic/English:

- Language is selected at login.
- Arabic mode must use full RTL layout.
- Numbers, amounts, dates, and financial values remain LTR.

## Berthing Fee Calculation

File:

```text
src/logic/berthingCalc.js
```

Rules:

- LOA maps to `L_index` 1–4.
- Tiered daily rates:
  - D1: days 1–3
  - D2: days 4–10
  - D3: days 11+
- Positions:
  - `Quay`: D1/D2/D3 tiered rates
  - `P2`: single flat rate
  - `En Rade`: single flat rate
  - `Congestion`: `$0` fee, saved as a record
- `Pos 3` / `P3` is free anchorage:
  - no fee
  - filtered out during Automate import
  - never saved as a berthing record
- `Congestion` may be read by AI as `"En Rade Free"`:
  - normalize it to `Congestion`
  - save it as a berthing record with `$0` fees
- Vessel category discounts apply, such as Lebanese 50% and Military 0%.
- Optional maintenance surcharge may apply.

## Receipt Calculation

File:

```text
src/logic/receiptCalc.js
```

Entry point:

```js
calculateReceipt({ berthingRows, serviceRows, moduleType })
```

### Line Filtering

Apply filtering before categorization:

- RS lines are excluded from all totals and display:

```js
service_code.startsWith('RS')
```

- Overtime lines are always treated as regular lines regardless of `is_taxable`:

```js
/-E$/i.test(code) || /OT|OVERT/i.test(code)
```

### GC vs Container Branching

General Cargo:

- Tax block shown.
- `STAMP` is taxable and included in `taxableSubtotal`.
- `fixedTotal` includes `AUTOM + BILLF`.
- Auto `STAMP` line: `qty=1`, `$2.00`.

Container:

- Tax block hidden.
- `STAMP` is fixed and included in `fixedTotal`.
- `fixedTotal` includes `AUTOM + BILLF + all STAMP lines`.
- Container tax of `$0.22` is added to `freshAmount`.
- Auto `STAMP` line: `qty=4`, `$8.00`.

### Receipt Formulas

```text
price       = berthingTotal + regularLines total
fundable    = min(price × 0.035, $450)
rehabFee    = (taxableSubtotal − 2) × 0.03511111
totalTax    = ((0.11 × taxableSubtotal − 0.22) × 0.035) + 0.11 × taxableSubtotal
freshAmount = price + fundable + fixedTotal + taxableSubtotal + totalTax + containerTax
finalPrice  = Math.ceil(freshAmount)
```

Notes:

- `rehabFee` is GC-only.
- `rehabFee` is `$0` if the fundable cap is reached.
- `totalTax` is GC-only.
- Container tax is container-only.
- `Math.ceil(freshAmount)` means any decimal rounds up; whole numbers stay unchanged.

## Auto System Lines

### General Cargo

Inserted once per voyage per `saveSession`.

```text
AUTOM  qty=1  rate=$1.00  total=$1.00  is_fixed=1  is_auto=0
BILLF  qty=1  rate=$1.00  total=$1.00  is_fixed=1  is_auto=0
STAMP  qty=1  rate=$2.00  total=$2.00  is_fixed=0  is_auto=1
```

### Container

Guarded by `hasAutoLines`.

```text
AUTOM  qty=1  rate=$1.00  total=$1.00
BILLF  qty=1  rate=$1.00  total=$1.00
STAMP  qty=4  rate=$2.00  total=$8.00
```

Do not create duplicate auto system lines.

## AI Import / Automate Screen

File:

```text
src/screens/automate/AutomateScreen.jsx
```

Flow:

```text
Upload → Review → Done
```

Rules:

- Accept PDF, JPG, PNG.
- Max file size: 8MB.
- PDF is rasterized in renderer with `pdfjs-dist`.
- Rasterization settings:
  - scale `1.5`
  - JPEG quality `0.82`
  - max 4 pages
- Base64 is sent to main process through IPC.
- Claude vision extraction uses `ai:extract`.
- Review screen must keep all extracted fields editable.
- Uncertain fields are highlighted amber.
- Multi-position berthing supports multiple rows.
- User can add/remove rows before insertion.
- Do not bypass review before insertion.

### Import-Time Filters

Filter these before the review screen:

- RS service codes:

```js
service_code.startsWith('RS')
```

- Free P3 berthing rows:

```js
FREE_POSITION_KEYS = { P3, POS3, POS_3 }
```

### Save Behavior

Berthing:

- Upsert by index.
- Find existing records for voyage.
- Call `updateBerthing` instead of `saveBerthing` when updating existing rows.
- This prevents duplicate berthing records.

Services:

- Use `replaceUserLines: true`.
- Soft-delete existing user lines first.
- Do not remove fixed/auto lines incorrectly.

### Position Normalization

```text
QUAY / POS1 / POS_1 / P1
  → Quay

P2 / POS2 / POS_2
  → P2

EN RADE / ENRADE / EN-RADE
  → En Rade

EN RADE FREE / ENRADE FREE / EN-RADE FREE / EN RADE LIBRE / CONGESTION / CONG
  → Congestion ($0 fee, saved)

P3 / POS3 / POS_3
  → FREE (filtered out, not a paying position)
```

## PDF Export

IPC:

```text
receipt:exportPDF
```

Implementation:

```js
webContents.printToPDF({
  pageSize: 'A4',
  printBackground: true,
  margins: { marginType: 'printableArea' }
})
```

Rules:

- Do not introduce external PDF libraries unless explicitly asked.
- `@media print` must use `position: static`, not `position: fixed`.
- `position: fixed` clips content to one viewport height.

## Module Status

Current known module status from the project context should be checked against the latest user instructions before making planning decisions.

From the uploaded Claude context:

```text
Berthing                          Complete
Container Services                Complete
General Cargo Services            Complete
Receipt Generation + PDF Export   Complete
Receipt Archive                   Complete
AI Document Import                Complete
Settings/API key management       Complete
Storage                           Not started
CMA Receipt                       Complete
User Management                   Not started in uploaded Claude context
Rates/Tariff Editor               Not started
```

If a newer `PROJECT_CONTEXT.md` or user message says a module is complete, prefer the newer context and mention the discrepancy before changing related code.

## Working Style for Codex

Before editing code:

1. Read this `AGENTS.md`.
2. Inspect the relevant files.
3. Explain what you found.
4. Propose the smallest safe implementation plan.
5. Do not touch unrelated files.
6. Preserve business rules.
7. Preserve IPC boundaries.
8. Preserve audit logging.
9. Preserve bilingual behavior.
10. Preserve simple UI.

After editing code:

1. Summarize changed files.
2. Explain what changed.
3. Explain how to test.
4. State whether the Electron window needs `Ctrl+R` or a full `npm run dev` restart.
5. Mention any risk or follow-up cleanup if relevant.

## Testing Expectations

When possible, run:

```bash
npm run dev
npm run build
```

If tests or lint scripts exist, run them.

If no automated tests exist, provide manual test steps for the user.

For billing-related changes, include at least one manual test case that verifies the affected calculation or receipt output.

## Safety Rules

Do not:

- Hard-delete business records.
- Expose API keys to renderer code.
- Add frontend DB access.
- Rewrite the app architecture.
- Change receipt formulas silently.
- Remove audit logging.
- Remove Arabic strings.
- Leave new UI strings untranslated.
- Duplicate auto system lines.
- Convert the app to TypeScript.
- Add heavy dependencies without explicit need.
- Touch unrelated files for cleanup.
