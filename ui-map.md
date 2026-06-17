# Ship Fees App — UI Structure Map

## Navigation Architecture

`MainApp.jsx` controls routing via `currentScreen` state (useState).  
Sidebar calls `setCurrentScreen(key)`. No router library — pure state switching.

**Screens:** `berthing` · `containers` · `general_cargo` · `receipts_archive` · `automate` · `cma` · `settings` · `user_management` · `home` (default)

**Receipt overlay:** `ReceiptPreview` rendered at MainApp level (not inside a screen) when `receiptState !== null`. Closed via `handleCloseReceipt()` → `setReceiptState(null)`.

---

## Screens

| File | Component | Back button? | Navigation prop |
|------|-----------|-------------|-----------------|
| `screens/Login.jsx` | Login | — (entry screen) | none |
| `screens/ChangePassword.jsx` | ChangePassword | — (blocking screen) | none |
| `screens/Home.jsx` | Home | — (home screen) | `setCurrentScreen` |
| `screens/berthing/BerthingScreen.jsx` | BerthingScreen | ✗ | `onGoToContainers`, `onGoToGeneralCargo`, `onGenerateReceipt` |
| `screens/berthing/BerthingForm.jsx` | BerthingForm | ✗ (has Cancel → `onCancelEdit`) | `onCancelEdit`, `onGoToContainers`, `onGoToGeneralCargo` |
| `screens/berthing/BerthingRecords.jsx` | BerthingRecords | ✗ | `onEdit`, `onGenerateReceipt` |
| `screens/container/ContainerScreen.jsx` | ContainerScreen | ✗ (phase: lookup → entry) | `initialVoyage`, `onVoyageConsumed`, `onGenerateReceipt` |
| `screens/container/ContainerForm.jsx` | ContainerForm | ✗ (has Change Voyage → `onChangeVoyage`) | `onChangeVoyage`, `onGenerateReceipt` |
| `screens/container/ContainerRecords.jsx` | ContainerRecords | ✗ | `onLookup`, `voyageError`, `looking`, `openingVoyage`, `refreshKey` |
| `screens/generalcargo/GeneralCargoScreen.jsx` | GeneralCargoScreen | ✗ (phase: lookup → entry) | `initialVoyage`, `onVoyageConsumed`, `onGenerateReceipt` |
| `screens/generalcargo/GeneralCargoForm.jsx` | GeneralCargoForm | ✗ (has Change Voyage → `onChangeVoyage`) | `onChangeVoyage`, `onGenerateReceipt` |
| `screens/generalcargo/GeneralCargoRecords.jsx` | GeneralCargoRecords | ✗ | `onLookup`, `voyageError`, `looking`, `openingVoyage`, `refreshKey` |
| `screens/receipt/ReceiptArchive.jsx` | ReceiptArchive | ✗ | `onViewReceipt` |
| `screens/receipt/ReceiptPreview.jsx` | ReceiptPreview | ✓ (← Close → `onClose`) | `onClose`, `autoExportPath`, `onAutoExportDone` |
| `screens/automate/AutomateScreen.jsx` | AutomateScreen | ✗ (multi-phase: upload → review → done) | `onGenerateReceipt` |
| `screens/automate/BatchImport.jsx` | BatchImport | ✗ (multi-phase) | `onExit`, `onReviewGroup`, `onViewReceipt` |
| `screens/cma/CMAScreen.jsx` | CMAScreen | ✗ | none |
| `screens/settings/SettingsScreen.jsx` | SettingsScreen | ✗ | none |
| `screens/users/UserManagementScreen.jsx` | UserManagementScreen | ✗ | none |

---

## Modals / Popups / Overlays

### Reusable component
| File | Component | Has × | Notes |
|------|-----------|--------|-------|
| `components/ConfirmDialog.jsx` | ConfirmDialog | ✗ | Has Cancel button. Used by BerthingForm, BerthingRecords, ContainerForm, GeneralCargoForm |

### Inline modals (rendered inside screen files)

| File | State / name | Has × | Close handler | zIndex |
|------|-------------|--------|---------------|--------|
| `screens/berthing/BerthingForm.jsx` | `showConfirm` | ✗ | `setShowConfirm(false)` via ConfirmDialog onCancel | 10000 |
| `screens/berthing/BerthingForm.jsx` | `showClearConfirm` | ✗ | `setShowClearConfirm(false)` via ConfirmDialog onCancel | 10000 |
| `screens/berthing/BerthingRecords.jsx` | `deleteTarget` | ✗ | `setDeleteTarget(null)` via ConfirmDialog onCancel | 10000 |
| `screens/container/ContainerForm.jsx` | `showSaveConfirm` | ✗ | `setShowSaveConfirm(false)` | 10000 |
| `screens/generalcargo/GeneralCargoForm.jsx` | `showSaveConfirm` | ✗ | `setShowSaveConfirm(false)` | 10000 |
| `screens/receipt/ReceiptArchive.jsx` | `deleteTarget` | ✗ | `setDeleteTarget(null)` | 10000 |
| `screens/cma/CMAScreen.jsx` | `showPicker` (agent export picker) | ✗ | `setShowPicker(false)` | 9999 |
| `screens/users/UserManagementScreen.jsx` | `editUser` (EditUserDialog) | ✓ | `setEditUser(null)` | 1000 |
| `screens/users/UserManagementScreen.jsx` | `resetUser` (ResetPasswordDialog) | ✓ | `setResetUser(null)` | 1000 |
| `screens/automate/AutomateScreen.jsx` | Processing overlay (`queueProcessing`) | ✗ | Auto-hides when done — no manual close | 99999 |
| `screens/receipt/ReceiptPreview.jsx` | `showRegenConfirm` (regen warning banner) | ✗ | `setShowRegenConfirm(false)` (OK button) | fixed banner |

### Toasts (auto-dismiss, no × needed)
`ReceiptPreview`, `ReceiptArchive`, `SettingsScreen`, `CMAScreen`, `AutomateScreen`, `UserManagementScreen`

---

## What needs adding

### Back buttons needed (top-left, calls `setCurrentScreen('home')` or equivalent)
- BerthingScreen
- ContainerScreen
- GeneralCargoScreen
- ReceiptArchive
- AutomateScreen
- CMAScreen
- SettingsScreen
- UserManagementScreen

### × close buttons needed (top-right of modal)
- ConfirmDialog (covers: BerthingForm save/clear, BerthingRecords delete, ContainerForm save, GeneralCargoForm save)
- ReceiptArchive `deleteTarget` modal
- CMAScreen `showPicker` modal
- AutomateScreen processing overlay — skip (not user-dismissible by design)
