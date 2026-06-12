# Ship Fees — Port of Beirut

Windows desktop app for Port of Beirut staff. Calculates berthing fees, records cargo services, generates receipts, and supports AI-assisted document import. Replaces the legacy `ShipFees.xlsm` spreadsheet.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 29 |
| UI | React 18 + Vite |
| Database | better-sqlite3 (SQLite, local) |
| Styling | Tailwind CSS |
| i18n | i18next — Arabic / English, full RTL |
| AI import | Claude vision API (claude-sonnet-4-6) |
| Installer | electron-builder → Windows NSIS `.exe` |

---

## Features

- **Berthing fees** — LOA-based tiered calculation across Quay, P2, and En Rade positions
- **Container services** — per-voyage line items with automatic stamp/billing fees
- **General Cargo services** — GC codes with tax calculation
- **Receipt generation** — full A4 PDF export with bilingual header
- **Receipt archive** — searchable history with soft-delete
- **AI document import** — upload a manifest (PDF/JPG/PNG), AI extracts fields; staff review before saving
- **User management** — admin and operator roles, password hashing via bcryptjs
- **Settings** — Claude API key stored locally at `C:\ShipFees\config\settings.json`

---

## Getting Started

```bash
npm install
npm run dev       # Vite on :5173 + Electron window
```

**Default login:** `admin` / `admin123` — you will be prompted to change the password on first login.

**Database location:** `C:\ShipFees\data\ship_fees.db` (created automatically on first launch)

---

## Build

```bash
npm run build     # Outputs Windows .exe installer to dist-app/
```

Requires Windows and the matching native build of `better-sqlite3` (handled by `postinstall`).

---

## Architecture

```
Renderer (React)  →  window.api.*  →  IPC  →  main.js  →  better-sqlite3
```

- Renderer never accesses the database directly
- All DB operations go through `preload.js` → `main.js` → `electron/database/handlers/`
- The Claude API key is never exposed to the renderer or DevTools
- All mutations write an audit log entry

---

## Module Status

| Module | Status |
|---|---|
| Berthing | Complete |
| Container Services | Complete |
| General Cargo Services | Complete |
| Receipt Generation + PDF Export | Complete |
| Receipt Archive | Complete |
| AI Document Import | Complete |
| User Management | In progress |
| Storage | Not started |
| Rates / Tariff Editor | Not started |
