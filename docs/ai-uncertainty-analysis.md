# AI Uncertainty Analysis

## Two Independent Sources of Uncertainty

Uncertainty flags shown in the review screen come from two completely separate systems. Understanding this distinction is critical for improving the user experience.

---

### Source 1: Model-side (`uncertain_fields`)

**Where:** `electron/handlers/ai.js` — the `EXTRACTION_PROMPT` instructs Claude to populate an `uncertain_fields` array in its JSON response.

**What it means:** The AI model genuinely could not read or determine a field's value from the document image.

**Prompt guardrails (lines 113–119):** The prompt explicitly tells the model NOT to flag uncertainty when:
- It successfully inferred position from berth name or code column
- Overtime is zero, empty, or successfully read from a column
- voyage_number was found and assigned
- vessel_type had any indication in the document

**Result:** `uncertain_fields` is a string array (e.g. `["flag", "services"]`) passed to `buildReviewState` as a `Set`.

---

### Source 2: Client-side code matching (`buildReviewState`)

**Where:** `src/logic/automateImport.js`, lines 90–131.

**This is the biggest driver of false-positive uncertainty flags.**

For **Container** service lines (line 110):
```js
_uncertain: uncertain?.has('services') || !mc || !ctype
```
- `!mc` — the extracted code doesn't match any code in the seeded `container_codes` DB table
- `!ctype` — container size (20ft/40ft) couldn't be determined

For **GC** service lines (line 130):
```js
_uncertain: uncertain?.has('services') || !mc
```
- `!mc` — the extracted code doesn't match any code in the seeded `gc_codes` DB table

**The problem:** A service line gets flagged as uncertain even when:
1. The AI read the code perfectly from the document
2. The code simply doesn't exist in the app's seed data (e.g. a new tariff code was introduced)
3. The container size was missing from the document but could default to 20ft

These are **data catalog gaps**, not AI confidence issues — but they look identical to the user.

---

## Impact on User Experience

Both sources produce the same visual indicator (amber border + `_uncertain: true`), making it impossible for the user to know whether:
- They need to verify the AI's reading (model uncertainty) — look at the document
- They just need to confirm/pick from a list (catalog gap) — routine data entry

This leads to unnecessary re-checking of correctly extracted data.

---

## Proposed Improvements for B5

### 1. Separate visual indicators by reason
Replace boolean `_uncertain` with `_uncertainReason`:
- `'model'` — AI flagged this field in `uncertain_fields`
- `'unknown_code'` — code not in catalog (`!mc`)
- `'missing_ctype'` — container size not determined (`!ctype`)

### 2. Per-field inline messages
- **model:** "AI couldn't read this clearly — please verify against document"
- **unknown_code:** "Code not in catalog — confirm or select from list"
- **missing_ctype:** "Container size not specified — defaulting to 20ft"

### 3. Soften `!ctype` handling
Default `container_type` to `'20ft'` instead of flagging as uncertain. Most port operations default to 20ft; the user can change it if needed.

### 4. De-emphasize the blocking banner
The generic banner at `AutomateScreen.jsx:583` (`import_uncertain_fields_blocking`) blocks insertion for any uncertainty. With per-field reasons, only `'model'` uncertainty should block; `'unknown_code'` and `'missing_ctype'` could be warnings that allow proceeding.

### 5. Future: auto-seed unknown codes
When an admin accepts an unknown code, offer to add it to the catalog for future imports. This would progressively eliminate `'unknown_code'` flags.
