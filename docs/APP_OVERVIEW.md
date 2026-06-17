# Ship Fees App — Feature Overview

Windows desktop app for Port of Beirut staff. Replaces `ShipFees.xlsm`. Calculates berthing fees, records cargo services, generates receipts, and supports AI document import.

---

## Authentication

- Login with username + password (bcryptjs hashing).
- First login as `admin` forces a password change before any screen is accessible.
- All session state (rates, agents, permissions) is loaded once after login and shared app-wide via `SessionContext`.

---

## Modules

### 1. Berthing

**What it does:** Records a vessel's stay at the port and calculates the berthing fee.

**How it works:**
- Staff enter voyage number, vessel name, LOA, ATA/ATD dates, position, vessel category, and optional maintenance surcharge.
- The app calculates the fee from tiered daily rates (D1 days 1–3, D2 days 4–10, D3 days 11+) keyed to an LOA index (1–4).
- **Positions:**
  - **Quay** — tiered daily rates apply.
  - **P2** — single flat rate.
  - **En Rade** — single flat rate.
  - **Congestion** — $0 fee, but record is saved.
  - **P3 / En Rade Free** — free anchorage; filtered out and never saved.
- Vessel category discounts (e.g. Lebanese 50%, Military 0%) are applied automatically.
- Multiple berthing rows per voyage are supported (different positions on the same voyage).
- Records are editable and soft-deletable from the Berthing Records table.

---

### 2. Container Services

**What it does:** Records container service charges for a voyage.

**How it works:**
- Staff select a voyage and add service lines (code, quantity, rate).
- Codes are fetched from `container_codes` table; each code has a fixed rate and an overtime flag.
- Three auto lines are inserted once per voyage if not already present: `AUTOM` ($1), `BILLF` ($1), `STAMP` (qty 4 × $2 = $8).
- Re-saving a voyage replaces existing user lines (soft-deletes old ones, inserts new ones) while preserving auto lines.

---

### 3. General Cargo (GC) Services

**What it does:** Records general cargo service charges for a voyage.

**How it works:**
- Same workflow as Container Services but uses `gc_codes` / `gc_services` tables.
- Auto lines inserted once: `AUTOM` ($1), `BILLF` ($1), `STAMP` (qty 1 × $2 = $2).
- `RS` service codes are silently excluded from all totals and display.

---

### 4. Receipt Generation

**What it does:** Calculates and displays the full financial receipt for a voyage.

**How it works:**

The receipt engine (`receiptCalc.js`) combines berthing and service data:

| Step | Detail |
|---|---|
| Line filtering | RS codes excluded; OT/overtime codes treated as regular lines |
| GC branch | Shows tax block; STAMP is taxable; `fixedTotal` = AUTOM + BILLF |
| Container branch | No tax block; STAMP is fixed; `fixedTotal` = AUTOM + BILLF + all STAMP lines; adds $0.22 container tax |
| `price` | berthingTotal + regularLines total |
| `fundable` | min(price × 3.5%, $450) |
| `rehabFee` | (taxableSubtotal − 2) × 0.03511111 — GC only; $0 if fundable capped |
| `totalTax` | `((0.11 × taxableSubtotal − 0.22) × 0.035) + 0.11 × taxableSubtotal` — GC only |
| `freshAmount` | price + fundable + fixedTotal + taxableSubtotal + totalTax + containerTax |
| `finalPrice` | `Math.ceil(freshAmount)` — any decimal rounds up; whole numbers unchanged |

The receipt preview opens as a full-screen overlay. Staff can export it to a PDF (A4, print background) via `webContents.printToPDF` — no external PDF library.

---

### 5. Receipt Archive

**What it does:** Lists all saved receipts for lookup and re-export.

**How it works:**
- Searchable by voyage number or vessel name; filterable by month.
- Sortable by any column.
- Staff can re-open the receipt preview or soft-delete a record (admin confirmation required).

---

### 6. AI Document Import — Automate (Single)

**What it does:** Reads a scanned shipping manifest (PDF or image) and pre-fills all voyage fields and service lines using Claude AI vision.

**How it works:**
1. **Upload phase** — staff pick a PDF, JPG, or PNG (max 8 MB). PDFs are rasterized in the renderer via `pdfjs-dist` (scale 1.5, JPEG 0.82, max 4 pages) and sent as base64 to the main process.
2. **AI extraction** — main process calls `claude-sonnet-4-6` vision API (`ai:extract` IPC). The model returns structured voyage data, berthing rows, and service lines.
3. **Review phase** — all extracted fields are shown in an editable form. Fields the model was uncertain about are highlighted amber ⚠. Staff can edit any value, add/remove berthing rows, and add manual service lines before saving.
4. **Save** — voyage is upserted, berthing records are upserted by index (no duplicates), service lines replace existing user lines. A PDF receipt is auto-exported to `C:\ShipFees\receipts\`.

**Import-time filters applied before the review screen:**
- RS service codes are dropped.
- P3 / Pos 3 berthing rows are dropped.

**Position alias normalization:** the AI output is normalized — e.g. `POS1`, `QUAY`, `P1` → Quay; `EN RADE FREE`, `CONGESTION`, `CONG` → Congestion ($0 fee).

---

### 7. AI Document Import — Batch Import

**What it does:** Processes multiple scanned pages (photos taken on a phone) in a single run, grouping them into per-voyage receipts automatically.

**How it works:**
1. Staff drop many image files at once (drag & drop or file picker).
2. Files with Samsung-style `YYYYMMDD_HHMMSS` filenames are sorted by timestamp; photos taken within 6 seconds of the previous one are grouped as pages of the same receipt. Files without a parseable timestamp each become their own single-page group.
3. Staff can drag pages between groups, split a page into its own group, or merge groups before processing.
4. The queue processes groups one at a time, calling the same AI extraction pipeline as single import.
5. Groups needing review are flagged `needs_review`; fully confident extractions go straight to `done`.
6. A summary screen shows per-group status. Staff can open any group's review screen, then return to the batch summary.

---

### 8. CMA Receipt

**What it does:** Generates a monthly container count and fee report for the CMA shipping agency.

**How it works:**
- Staff select year + month and click Generate.
- The report shows per-voyage container counts (local 20′, local 40′, transit 20′, transit 40′), TEU totals, and fees, grouped by shipping agent.
- A "hide zero rows" toggle cleans up the table.
- Staff can export the report for a selected agent to an Excel file via a system save-dialog.

---

### 9. User Management (Admin only)

**What it does:** Admins can create, edit, reset passwords for, and deactivate staff accounts.

**How it works:**
- Usernames must be 3–30 lowercase alphanumeric/underscore characters.
- Three per-user permissions can be toggled: Generate CMA Receipt, Edit Others' Records, Access Tariff Editor.
- Deactivated users cannot log in.
- Admin cannot deactivate or delete their own account.

---

### 10. Settings (Admin only)

**What it does:** Stores the Claude API key used by the AI import feature.

**How it works:**
- Key is saved to `C:\ShipFees\config\settings.json` (not the database, not source control).
- The key is never exposed to the renderer or DevTools.

---

## Language Support

Full Arabic / English bilingual support with RTL layout for Arabic. Every UI string has a key in both `en.json` and `ar.json`. All financial numbers are always displayed left-to-right regardless of language.

---

## Data & Storage

- SQLite database at `C:\ShipFees\data\ship_fees.db`.
- All deletes are soft (`is_deleted = 1`); rows are never physically removed.
- Every insert, update, and soft-delete writes an entry to `audit_log` with old/new JSON.
- Voyage number is the hub — all billing records (berthing, services, receipts) link by voyage number text key.
- Exported PDF receipts are saved to `C:\ShipFees\receipts\`.

---

## Architecture Summary

```
Renderer (React/Vite)
  └─ window.api.*  (contextBridge in preload.js)
       └─ IPC invoke  →  main.js handlers
            ├─ electron/database/handlers/   (SQLite via better-sqlite3)
            └─ electron/handlers/ai.js       (Claude API — key never in renderer)
```

The renderer never touches the database or the API key directly.
