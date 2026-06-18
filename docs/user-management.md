# User Management

## Admin Screen (`/user_management`)

Full control over all user accounts. Accessible to admins only.

### What you can do

- **View all users** — table with username, full name, role, presence status, language, last login
- **Add user** — create a new account with username, full name, role, language, and a temporary password (user is forced to change it on first login)
- **Edit user** — change full name, role, and language. Cannot change your own role.
- **Reset password** — set a new temporary password for any user (they'll be prompted to change it)
- **Enable / Disable account** — block a user from logging in without deleting them. Cannot disable your own account. Cannot disable the last active admin.
- **Delete user** — permanently removes the account. Blocked if the user has records in the system (disable instead).
- **Manage permissions** — grant or revoke extra permissions for non-admin users:
  - Generate CMA Receipt
  - Edit other users' records
  - Access Tariff Editor

### Roles

| Role | Access |
|---|---|
| Admin | Everything, including User Management and Settings |
| Manager | All billing screens + Staff view |
| User | All billing screens |

### Presence status

The Status column shows live activity — refreshes every 30 seconds.

| Status | Meaning |
|---|---|
| Online | Active in the last 3 minutes |
| Idle | Logged in but inactive for 3–30 minutes |
| Offline | Not logged in, or inactive for 30+ minutes |

Disabled accounts appear dimmed with a red **disabled** badge on the username row.

---

## Manager Screen (`/staff_view`)

Read-only view for managers. Shows all users without their role.

- Same presence status column (Online / Idle / Offline)
- No add, edit, delete, or permission controls
- Disabled accounts shown as dimmed rows with badge
- Auto-refreshes every 30 seconds
