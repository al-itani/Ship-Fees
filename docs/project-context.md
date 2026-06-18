# Ship Fees App — Project Context
**Port of Beirut — Desktop Billing System**
**Last updated: June 2026**

---

## What We're Building

A Windows desktop app that replaces an Excel-based ship fee billing system used at the Port of Beirut. It handles fee calculation, receipt generation, and record-keeping for all vessel types. Built with Electron + React (frontend) and SQLite (database), packaged as a self-contained .exe installer.

The app runs on one main Windows PC. Other staff connect over the local network. No internet required.

---

## Tech Stack

- **Framework:** Electron + React
- **Database:** SQLite (stored locally at `C:\ShipFees\data\ship_fees.db`)
- **PDF export:** Electron IPC (`webContents.printToPDF`)
- **AI/OCR:** Claude vision API (claude-sonnet-4-6, for document scanning/automation)
- **Image compression:** sharp (resizes scans before sending to API)
- **Build output:** `.exe` installer via `npm run build` — fully self-contained

---

## Modules — Status

| Module | Status |
|---|---|
| Berthing | ✅ Complete |
| Container Services | ✅ Complete |
| General Cargo (GC) Services | ✅ Complete |
| Receipt Generation | ✅ Complete |
| CMA Receipt | ✅ Complete |
| User Management / Admin Panel | ✅ Complete |
| Audit Log Screen | ✅ Complete |
| Manager Role + Staff Presence View | ✅ Complete |
| Voyage Services (tabbed Berthing + Container + GC) | ✅ Complete |
| Batch Import (multi-document AI import) | ✅ Complete |
| Git setup | ✅ Complete |
| Receipt Archive | ✅ Complete |
| Storage Module | 🔜 Pending (lowest priority) |
| Tariff Editor | 🔜 Pending |
| Backup System | 🔜 Pending |
| Network / Multi-machine architecture | 🔜 Planned for later |

---

## Key Features Built

### Berthing Module
Calculates berthing fees based on LOA (length categories L1–L4), position (Quay / P2 / En Rade / Congestion), number of days, and vessel category (Lebanese, Military, Ro-Ro, etc.). Minimum fees enforced per position. Soft delete + audit log on all records.

### Container & GC Services
Searchable service code dropdowns, auto-fill price and unit, line totals with minimums enforced, soft delete, audit log. Auto-system lines (AUTOM $1, BILLF $1, STAMP $2 GC / $8 Container) appended on every save session.

### Voyage Services Screen
Tabbed interface combining Berthing, Container, and GC into a single screen. User enters a voyage number once and navigates between all three modules via tabs — no re-entering the voyage number.

### Receipt Generation
- Full calculation engine (`receiptCalc.js`)
- Receipt preview screen (full-screen overlay via React portal)
- PDF export via Electron IPC
- Saved to `receipts` table
- Fixes: overtime fees included, RS fees excluded, $0.22 container tax, stamp code logic `(stamp_fee - 2) / 3`

### CMA Receipt
Monthly aggregate report for CMA shipping line. Covers all CMA container activity for a given month. Splits into Local and Transit TEU categories. Admin-only (grantable to specific users). Rates in USD and LBP.

**TEU Codes:**
- Local (tblTEUL): C1, C5, FRP, FRV, FCP, FCV, C1-E, FRP-E, FCP-E, C123, C321-E, C524, C425
- Transit (tblTEUT): T-MSK1, T-MSK2, T-MSC, TR-STD, T-CMA, T-T21, T-SHS
- 20ft = 1 TEU / 40ft = 2 TEUs
- Local rate: $13.92/TEU (LBP 479,260) | Transit rate: $9.05/TEU (LBP 311,519)

### Automation (Single Document Scanning)
3-phase flow: Upload → Review → Done. Claude vision API extracts service lines from scanned documents. All fields editable pre-insert; uncertain fields highlighted amber. Post-insertion screen shows "Generate Receipt" and "New Automation" buttons.

### Batch Import (Multi-Document AI Import)
Processes multiple scanned documents in one session. Documents are grouped into voyages, pages can be reordered/split/merged between groups. Each group goes through the same extract → review → insert pipeline. Built on shared `automateImport.js` logic with `batchGrouping.js` for page management.

### User Management
- Three roles: **Admin**, **Manager**, **User**
- Admin: full access, manage accounts, edit rates, CMA receipt, full audit trail, grant special permissions
- Manager: access to Staff View (presence/activity dashboard for their team)
- User: enter records, view records, edit/delete own records, generate receipts
- Admin panel and audit log are hidden from non-admin users
- Login history and session management in place

### Manager / Staff Presence View
Managers can see all staff users with real-time presence status (Online / Idle / Offline) based on `last_seen` heartbeat timestamps. Sortable table. Disabled accounts shown as dimmed rows with a badge.

### Audit Log Screen
Admin-only screen showing a paginated, filterable log of all INSERT / UPDATE / DELETE actions across the system. Filters: action type, table, user, date range. Grouped bulk-import entries show a human-readable summary instead of raw field JSON.

### Receipt Archive
Searchable history of all saved receipts. Admin can view any receipt; users see their own. Clicking a receipt opens the full ReceiptPreview in read-only mode.

---

## Important Business Rules

- Position mapping: P2/POS2/POS_2 → P2 | En Rade is a separate position | P3/POS3 = free anchorage, never billed
- Voyage # and Bill # are separate fields (not auto-linked)
- RS fees are never inserted into receipts
- Overtime fees are scanned and included
- $0.22 tax always added to container ship totals before rounding
- Stamp code formula: `(stamp_fee - 2) / 3` (e.g. $8 stamp → 2 stamp codes)
- FH-CMA blocked for 40ft containers
- C34/C35 require manual rate entry
- C7-ME = $0
- Language toggle (Arabic/English) fixed at login; Arabic = full RTL; numbers always LTR (`dir="ltr"`)
- CMA double-count fix: use `GROUP BY voyage_number` not `DISTINCT (voyage_number, agent)` for multi-position voyages
- Soft deletes only — never `DELETE`, always `UPDATE SET is_deleted = 1`
- Every INSERT/UPDATE/soft-delete writes to `audit_log`

---

## Users & Access

- ~5–10 staff users, one office, local network
- Low to no computer skill — UI designed accordingly (large targets, dropdowns, real-time fee preview, plain error messages)
- Language: Arabic + English, user selects at login, preference saved per account
- Sessions expire after configurable idle timeout

---

## Database

**Location:** `C:\ShipFees\data\ship_fees.db`

**Tables:** `users`, `berthing_records`, `audit_log`, `berthing_rates`, `berthing_minimums`, `vessel_categories`, `shipping_agents`, `voyages`, `gc_codes`, `gc_services`, `container_codes`, `container_services`, `receipts`

**Voyage # is the hub** — all billing records link by `voyage_number` text key.

---

## Pending / What's Next

- Storage module — deferred, lowest priority
- Tariff editor — admin edits rates without touching DB
- Backup system — auto daily backup + Excel export
- Network/multi-machine architecture — planned for later phase
- `.exe` build & distribution — run `npm run build` when stable; installer is fully self-contained

---

## Sharing the App

Run `npm run build` to produce the `.exe` installer. Send the installer to the colleague. They just run it — no Node.js, no npm, nothing else needed. Each machine starts with a fresh empty database (correct until network architecture is built).

---

## Project History (Chronological)

1. Analyzed original `Ship_Fees.xlsm` — broke down all formulas, rules, and logic
2. Wrote full system spec (`Ship_Fees_System_Spec.md`)
3. Built Phase 1: Berthing module — tested with 6 known calculation cases
4. Fixed Phase 1 bugs (Arabic display, vessel type dropdown, ATA/ATD input, voyage/bill# separation)
5. Built Phase 2: Container + GC modules
6. Built receipt generation engine with all fixes applied
7. Built CMA receipt
8. Built user management / admin panel (Admin + User roles)
9. Set up Git with proper `.gitignore`
10. Improved automation workflow UX (post-insertion buttons, amber uncertain fields)
11. Added Receipt Archive screen
12. Added Audit Log screen (admin-only, paginated, filterable)
13. Added Manager role with Staff Presence View (Online/Idle/Offline)
14. Built Voyage Services Screen — tabbed Berthing + Container + GC in one view
15. Built Batch Import — multi-document AI scanning with page grouping/reordering
16. Discussed `.exe` distribution and multi-machine setup

---

*This file is the single source of truth for the project. Update it as new features are completed.*
