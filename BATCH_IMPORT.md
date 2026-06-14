# Batch Import Feature

## Overview

Adds a **Batch Import** mode to the Automation screen. Instead of importing one receipt at a time, users can drop in a folder of phone photos, have them auto-grouped into receipts, review/fix the grouping, then process everything through the existing AI extraction pipeline sequentially.

---

## New Files

### `src/logic/batchGrouping.js`
Pure grouping logic — no IPC, no React.

**Key constant:**
```js
export const BATCH_GROUP_THRESHOLD_SECONDS = 12
```
Adjust this at any time to change how aggressively photos are grouped. A 12-second gap starts a new receipt.

**Samsung filename parsing:**  
Pattern: `YYYYMMDD_HHMMSS.jpg` (e.g. `20260612_091530.jpg`). Impossible dates (month 13, etc.) are rejected and fall back to the file's modified date. If neither is usable, the file gets its own group of 1.

**Grouping algorithm:**  
Files are sorted chronologically, then grouped by timestamp delta. Files without a usable timestamp skip to the end, each in their own group.

**Mutation helpers** (all return new arrays, pure):
- `buildGroups(files)` — initial auto-grouping
- `movePage(groups, pageId, targetGroupId, beforePageId)` — drag between groups or reorder within
- `splitPage(groups, pageId)` — remove a page into its own new group
- `movePageToNewGroup(groups, pageId)` — drop onto the "new receipt" zone
- `mergeWithPrevious(groups, groupId)` — merge a group with the one above it

---

### `src/screens/automate/automateImport.js`
Shared pipeline module **extracted** from `AutomateScreen`. Both the single import flow and Batch Import call this — no duplication.

Contains:
- `POSITIONS`, `POSITION_MAP`, `FREE_POSITION_KEYS`, `normalizePosition()` — position normalization
- `toDateInput()` — `DD/MM/YYYY` → HTML `datetime-local` format
- `EXTRACT_ERROR_KEYS` — maps API error codes to i18n keys
- `buildReviewState(fields, uncertain, containerCodes, gcCodes)` — maps raw AI extraction output to the review form shape (form, berthingRows, serviceLines, uncertainFields)
- `computeBreakdowns(berthingRows, form, ratesData)` — live berthing fee calc
- `validateReviewData(form, berthingRows, breakdowns)` — same validation rules as the review screen's "Insert All"
- `insertVoyage({ form, validRows, serviceLines, manualLines, userId })` — berthing upsert by index + service save with `replaceUserLines: true`; throws on failure; audit logging happens in the DB handlers as normal

---

### `src/screens/automate/BatchImport.jsx`
The four-step batch UI. Exposed as a `forwardRef` component so `AutomateScreen` can call `batchRef.current.resolveGroup(groupId, result)` after a user finishes reviewing a held group.

**Props:**
| Prop | Type | Description |
|---|---|---|
| `containerCodes` | array | From `window.api.containerGetCodes()` |
| `gcCodes` | array | From `window.api.gcGetCodes()` |
| `onExit` | fn | Called when user clicks Done or Back to cancel |
| `onReviewGroup` | fn(group) | Called when user clicks a "Needs review" group |

**Steps:**
1. **Select** — Drop zone + Browse Files (multi-select). Previews thumbnails, per-file timestamps, remove button.
2. **Group** — Card-per-receipt layout. Drag pages between cards. ✂ Split button on multi-page groups. ⤴ Merge with previous button on cards after the first. Drop zone at bottom creates a new receipt from a page.
3. **Process** — Groups processed one at a time. Per-group status: Waiting / Processing… / Inserted / Failed / Needs review. Progress bar. Failures show the error message inline. The queue never stops on a single failure.
4. **Summary** — Count of inserted / needs review / failed. "Review Pending" button opens the first held group. "New Batch" resets. "Done" exits.

**Auto-insert vs. Needs Review:**  
A group only auto-inserts when ALL of the following are true:
- Zero uncertain fields from extraction
- Every service line matched a known code
- All required-field validations pass (voyage number, vessel name, agent, ATA, ATD, LOA, at least one valid berthing row)

Anything that doesn't meet all three conditions is held as "Needs Review" — never silently inserted.

---

## Modified Files

### `src/screens/automate/AutomateScreen.jsx`

- Imports shared helpers from `automateImport.js` instead of duplicating them
- Adds a **🗂 Batch Import** button at the bottom of the upload card
- Mounts `<BatchImport>` in a hidden `div` while a held group is open for review (so queue state survives the handoff)
- When a group is open in review, the "Start Over" button becomes "Back to Batch"
- After Insert All for a batch-review group, returns to the batch summary and resolves the group to "Inserted"

The single-import flow is **completely unchanged in behavior** — only internal helpers were extracted.

### `src/components/DocumentImport.jsx`
- PDF page limit raised from **4 → 20**  
  Applies to both single import and batch import (both use the same `pdfToImages` / `pdfToImagesFromBase64` helpers)

### `electron/main.js`
- `dialog:openDocuments` handler now returns `mtimeMs` (file modified timestamp in epoch ms) alongside each file
- Used by Batch Import as a fallback timestamp when the filename doesn't match the Samsung pattern

### `src/i18n/en.json` + `src/i18n/ar.json`
38 new keys added under the `batch_*` namespace. Full RTL support — layout uses `marginInline` / `insetInlineStart` / `insetInlineEnd` logical CSS properties.

---

## Architecture Notes

- **IPC pattern preserved** — `BatchImport` accesses the DB only through `window.api` (via `insertVoyage` in `automateImport.js`)
- **Audit log** — every insertion goes through the same DB handlers as single import, so audit entries are written identically
- **No new IPC channels** — reuses `dialog:openDocuments`, `ai:extract`, all berthing/service/container handlers
- **Restart required** — `electron/main.js` was modified; a force-reload of the renderer window is not enough. Full Electron restart needed after deploying this change.

---

## Tuning

| Constant | File | Default | Purpose |
|---|---|---|---|
| `BATCH_GROUP_THRESHOLD_SECONDS` | `src/logic/batchGrouping.js` | `12` | Max seconds between photos to be grouped into one receipt |
| `numPages` cap | `src/components/DocumentImport.jsx` | `20` | Max PDF pages rasterized per file |
| `MAX_BYTES` | `src/screens/automate/BatchImport.jsx` | `8 MB` | Per-file size limit for batch files |
