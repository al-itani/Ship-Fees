# Commit Tracker — Tasks B1-B10, B8-B9, B11, C3+D2, E1, E2, C2

Track which files each task touches so we can split commits cleanly.

---

## Task 1: B1+B2+B3+B6+B10 — Automate page consolidation
**Status:** pending
**Files:**
- `src/screens/automate/AutomateScreen.jsx` — remove upload phase, single-import mode; always start in batch
- `src/screens/automate/BatchImport.jsx` — remove merge button, larger hover preview, remove-all button, accept button on review tabs
- `src/logic/batchGrouping.js` — (mergeWithPrevious left unused or removed)
- `src/i18n/en.json` — add batch_remove_all, batch_accept_ai
- `src/i18n/ar.json` — add batch_remove_all, batch_accept_ai

## Task 2: B8+B9 — Concurrent AI processing + per-receipt progress
**Status:** pending
**Files:**
- `src/screens/automate/BatchImport.jsx` — rewrite startProcessing for concurrency=3, per-group progress bars

## Task 3: B11 — "View Receipt" after save
**Status:** pending
**Files:**
- `src/screens/automate/AutomateScreen.jsx` — done phase view receipt button
- `electron/database/handlers/receipts.js` — add existsForVoyage
- `electron/main.js` — register receipt:existsForVoyage IPC
- `electron/preload.js` — expose receiptExistsForVoyage
- `src/i18n/en.json` — add view_receipt key
- `src/i18n/ar.json` — add view_receipt key

## Task 4: C3+D2 — Super-admin + profile fields/avatar + pin self
**Status:** done
**Files:**
- `electron/database/schema.js` — migrations: is_superadmin, avatar_path, email, phone columns + vendor_support seed
- `electron/database/handlers/users.js` — getAll WHERE is_superadmin=0, guard mutations, updateProfile
- `electron/database/handlers/auth.js` — return avatar_path, email, phone in login
- `electron/main.js` — register users:updateProfile, users:uploadAvatar, users:getAvatarBase64 IPC
- `electron/preload.js` — expose usersUpdateProfile, usersUploadAvatar, usersGetAvatarBase64
- `src/context/SessionContext.jsx` — carry avatar_path, email, phone in session
- `src/screens/users/UserManagementScreen.jsx` — pinned profile card, avatar, filter self from table
- `src/i18n/en.json` — profile keys
- `src/i18n/ar.json` — profile keys

## Task 5: E1 — Usage stats table + handler
**Status:** done
**Files:**
- `electron/database/schema.js` — CREATE TABLE usage_stats + indexes
- `electron/database/handlers/stats.js` — NEW: log + getStats
- `electron/main.js` — register stats:log, stats:getStats IPC
- `electron/preload.js` — expose statsLog, statsGetStats
- `electron/database/handlers/auth.js` — log login/logout/password_change
- `electron/database/handlers/receipts.js` — log receipt_generated/receipt_deleted
- `electron/database/handlers/berthing.js` — log berthing actions
- `electron/database/handlers/container.js` — log container_saved
- `electron/database/handlers/gc.js` — log gc_saved
- `electron/database/handlers/users.js` — log user actions
- `electron/database/handlers/storage.js` — log storage actions
- `electron/database/handlers/audit.js` — log batch_import
- `electron/handlers/ai.js` — log ai_extract
- `electron/main.js` — modify ai:extract + cma:exportExcel to log

## Task 6: E2 — Statistics & Usage screen
**Status:** done
**Files:**
- `src/screens/users/StatisticsScreen.jsx` — NEW
- `src/screens/MainApp.jsx` — add statistics route
- `src/components/Sidebar.jsx` — add statistics nav item
- `src/i18n/en.json` — statistics keys
- `src/i18n/ar.json` — statistics keys

## Task 7: C2 — Login/SSO study doc
**Status:** done
**Files:**
- `docs/login-sso-study.md` — NEW
