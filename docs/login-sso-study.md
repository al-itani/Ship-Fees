# Login / Saved Credentials / SSO — Study

This document evaluates three approaches for reducing login friction in the Ship Fees desktop app. The app currently requires username + password on every launch.

---

## Option A — Remember-me with encrypted credential storage

**Mechanism:** Use Electron's `safeStorage` API, which wraps Windows DPAPI (Data Protection API) to encrypt/decrypt data tied to the current Windows user account.

**Flow:**
1. Add a "Remember me" checkbox to `Login.jsx`.
2. On successful login with "Remember me" checked:
   - Generate a random opaque token (e.g. `crypto.randomUUID()`).
   - Store the token in the `users` table: `UPDATE users SET remember_token = ? WHERE id = ?`.
   - Encrypt the token with `safeStorage.encryptString(token)` and write the buffer to `%APPDATA%\Ship Fees\auth.dat`.
3. On app launch (in `main.js`, before window creation):
   - If `auth.dat` exists, read and decrypt it with `safeStorage.decryptString(buffer)`.
   - Look up the token: `SELECT * FROM users WHERE remember_token = ? AND is_active = 1`.
   - If found, auto-login (skip the login screen). If not found (token rotated, user disabled), delete `auth.dat` and show normal login.
4. On each successful login, rotate the token (generate new, update DB, re-encrypt file). This limits replay window.
5. On logout, delete `auth.dat` and clear `remember_token` in DB.

**DB change:** `ALTER TABLE users ADD COLUMN remember_token TEXT` (additive, try/catch).

**Security notes:**
- Plaintext passwords are never stored. The token is opaque and rotated.
- `safeStorage` / DPAPI ties encryption to the Windows user account. Moving `auth.dat` to another machine or user profile fails to decrypt — this is the desired behavior.
- Token rotation on every login limits the window if a token is somehow leaked.
- Logout explicitly clears both the file and the DB column.

**Trade-offs:**
- Works well for roaming users who switch between workstations (they just need to check "Remember me" once per machine).
- Requires the Windows user account to remain the same — if IT resets the Windows profile, `auth.dat` becomes unreadable (harmless: user just logs in normally).

---

## Option B — Windows username matching (lightweight SSO)

**Mechanism:** Map each app user to a Windows username. On launch, if the current Windows session matches a mapped user, auto-login without prompting.

**Flow:**
1. Main process reads `os.userInfo().username` at boot.
2. Query: `SELECT * FROM users WHERE windows_username = ? AND is_active = 1`.
3. If exactly one match, auto-login. If zero or multiple, show normal login screen.
4. Admin UI: add a "Windows Username" field to the Edit User dialog in `UserManagementScreen.jsx`. Admin maps each app account to the Windows login name of the workstation it runs on.

**DB change:** `ALTER TABLE users ADD COLUMN windows_username TEXT` (additive, try/catch).

**Security notes:**
- Trust boundary: whoever owns the Windows session owns the mapped app account. This is acceptable for a single-office trusted-staff deployment where each workstation has a dedicated operator.
- Not suitable if multiple people share a single Windows account — in that case, use Option A instead.
- If a staff member changes workstations, the admin remaps the `windows_username`.

**Trade-offs:**
- Zero-click login on dedicated workstations — best UX for the primary use case.
- Requires admin to maintain the mapping when staff or workstations change.
- Does not work for remote/roaming users.

---

## Option C — True AD/Kerberos SSO

**Mechanism:** Use `node-sspi` (native Node.js module) to perform NTLM or Kerberos authentication against the domain's Active Directory.

**Flow:**
1. Install `node-sspi` as a native dependency (requires C++ build tools, arch-specific binary).
2. On app launch, initiate an SSPI handshake to authenticate the current Windows session against AD.
3. AD returns the authenticated domain\username. Map to an app user via a `domain_username TEXT` column.
4. If mapped and active, auto-login.

**Security notes:**
- Enterprise-grade authentication — the strongest option.
- Requires the Port to have Active Directory infrastructure.
- Native module (`node-sspi`) must be compiled per architecture and Electron version — adds build complexity.

**Trade-offs:**
- Heavy dependency and deployment complexity.
- Only viable if the Port runs Active Directory (currently unknown).
- Recommend deferring unless enterprise SSO is explicitly requested.

---

## Recommendation

**Implement A + B together.**

- **Option A (Remember-me)** covers roaming users and personal preference. Low effort (~1 session).
- **Option B (Windows username)** covers dedicated workstations — zero-click login. Very low effort (~0.5 session).
- **Option C (AD/Kerberos)** deferred unless the Port has Active Directory and requests enterprise SSO (~2+ sessions with deployment complexity).

A and B are complementary: B auto-logs in on mapped workstations, A remembers the user on unmapped ones. Both fall back gracefully to the normal login screen.

---

## DB changes summary

```sql
ALTER TABLE users ADD COLUMN remember_token TEXT;
ALTER TABLE users ADD COLUMN windows_username TEXT;
```

Both additive, wrapped in try/catch (existing migration pattern).

---

## Implementation effort estimate

| Option | Effort | Dependencies |
|--------|--------|-------------|
| A (Remember-me) | ~1 session | Electron `safeStorage` (built-in) |
| B (Windows username) | ~0.5 session | `os.userInfo()` (built-in) |
| C (AD/Kerberos) | ~2+ sessions | `node-sspi` (native, build complexity) |
