const bcrypt = require('bcryptjs')
const db = require('../db')
const statsHandlers = require('./stats')

const PERMISSION_ALIASES = {
  perm_voyage: ['perm_berthing', 'perm_container', 'perm_gc'],
  perm_receipt: ['perm_receipt_archive'],
}

function writeAudit(recordId, action, oldData, newData, userId) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES ('users', ?, ?, ?, ?, ?)
  `).run(recordId, action, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null, userId)
}

function isSuperadmin(id) {
  const row = db.prepare('SELECT is_superadmin FROM users WHERE id = ?').get(id)
  return row && row.is_superadmin === 1
}

function getAll() {
  try {
    const users = db.prepare(`
      SELECT id, username, full_name, role, language, is_active, must_change_password,
             created_at, last_login, created_by, is_online, last_seen,
             perm_storage, perm_automate, perm_cma, perm_tariff_c,
             perm_berthing, perm_container, perm_gc, perm_receipt,
             perm_voyage, perm_receipt_archive, perm_audit_log, perm_staff_view,
             perm_view_users, avatar_path, email, phone
      FROM users
      WHERE is_superadmin = 0
      ORDER BY role DESC, username ASC
    `).all()
    return { success: true, data: users }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function create({ username, full_name, role, language, temp_password, admin_id }) {
  try {
    const uname = username.trim()
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(uname)
    if (existing) return { success: false, error: 'username_taken' }

    const adminRow = db.prepare('SELECT username FROM users WHERE id = ?').get(admin_id)
    const hash = bcrypt.hashSync(temp_password, 10)

    const result = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, language, must_change_password, created_by)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(uname, full_name.trim(), hash, role, language, adminRow?.username || null)

    writeAudit(result.lastInsertRowid, 'INSERT', null,
      { message: `Created user: ${uname} (role: ${role})` }, admin_id)

    try { statsHandlers.log({ user_id: admin_id, action_type: 'user_created', detail: { target: uname } }) } catch {}
    return { success: true, id: result.lastInsertRowid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function update(id, { full_name, role, language }, admin_id) {
  try {
    if (isSuperadmin(id)) return { success: false, error: 'cannot_modify_superadmin' }
    const old = db.prepare('SELECT full_name, role, language FROM users WHERE id = ?').get(id)
    if (!old) return { success: false, error: 'user_not_found' }

    db.prepare('UPDATE users SET full_name = ?, role = ?, language = ? WHERE id = ?')
      .run(full_name.trim(), role, language, id)

    const changed = []
    if (old.full_name !== full_name.trim()) changed.push('full_name')
    if (old.role !== role) changed.push('role')
    if (old.language !== language) changed.push('language')

    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(id)
    writeAudit(id, 'UPDATE', old,
      { message: `Edited user: ${userRow.username} — changed ${changed.join(', ')}` }, admin_id)

    try { statsHandlers.log({ user_id: admin_id, action_type: 'user_updated', detail: { target: userRow.username } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function resetPassword(id, temp_password, admin_id) {
  try {
    if (isSuperadmin(id)) return { success: false, error: 'cannot_modify_superadmin' }
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(id)
    if (!userRow) return { success: false, error: 'user_not_found' }

    const hash = bcrypt.hashSync(temp_password, 10)
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, id)

    writeAudit(id, 'UPDATE', null,
      { message: `Password reset for: ${userRow.username}` }, admin_id)

    try { statsHandlers.log({ user_id: admin_id, action_type: 'user_updated', detail: { action: 'password_reset', target: userRow.username } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function setActive(id, isActive, admin_id) {
  try {
    if (isSuperadmin(id)) return { success: false, error: 'cannot_modify_superadmin' }
    const userRow = db.prepare('SELECT username, role, is_active FROM users WHERE id = ?').get(id)
    if (!userRow) return { success: false, error: 'user_not_found' }
    if (id === admin_id) return { success: false, error: 'cannot_self_disable' }

    // Guard: cannot disable the last active admin
    if (!isActive && userRow.role === 'admin') {
      const activeAdmins = db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1"
      ).get().c
      if (activeAdmins <= 1) return { success: false, error: 'last_admin' }
    }

    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)

    const action = isActive ? 'Enabled' : 'Disabled'
    writeAudit(id, 'UPDATE', { is_active: userRow.is_active },
      { message: `${action} user: ${userRow.username}` }, admin_id)

    try { statsHandlers.log({ user_id: admin_id, action_type: isActive ? 'user_enabled' : 'user_disabled', detail: { target: userRow.username } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getPermissions(user_id) {
  try {
    const rows = db.prepare('SELECT permission_key FROM user_permissions WHERE user_id = ?').all(user_id)
    return { success: true, data: rows.map(r => r.permission_key) }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

const COLUMN_PERMS = [
  'perm_storage', 'perm_automate', 'perm_cma', 'perm_tariff_c',
  'perm_berthing', 'perm_container', 'perm_gc', 'perm_receipt',
  'perm_voyage', 'perm_receipt_archive', 'perm_audit_log', 'perm_staff_view',
  'perm_view_users',
]

function setPermission(user_id, permission_key, grant, admin_id) {
  try {
    if (isSuperadmin(user_id)) return { success: false, error: 'cannot_modify_superadmin' }
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(user_id)
    if (!userRow) return { success: false, error: 'user_not_found' }

    if (COLUMN_PERMS.includes(permission_key)) {
      const linkedColumns = PERMISSION_ALIASES[permission_key] || []
      for (const col of [permission_key, ...linkedColumns]) {
        db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(grant ? 1 : 0, user_id)
      }
      writeAudit(user_id, 'UPDATE', null,
        { message: `${grant ? 'Granted' : 'Revoked'} ${permission_key} ${grant ? 'to' : 'from'}: ${userRow.username}` }, admin_id)
    } else if (grant) {
      db.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission_key, granted_by) VALUES (?, ?, ?)')
        .run(user_id, permission_key, admin_id)
      writeAudit(user_id, 'INSERT', null,
        { message: `Granted ${permission_key} to: ${userRow.username}` }, admin_id)
    } else {
      db.prepare('DELETE FROM user_permissions WHERE user_id = ? AND permission_key = ?')
        .run(user_id, permission_key)
      writeAudit(user_id, 'DELETE', null,
        { message: `Revoked ${permission_key} from: ${userRow.username}` }, admin_id)
    }

    try { statsHandlers.log({ user_id: admin_id, action_type: 'permission_changed', detail: { target: userRow.username, key: permission_key, grant } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function checkHasRecords(user_id) {
  try {
    const b = db.prepare('SELECT COUNT(*) as c FROM berthing_records WHERE created_by = ? AND is_deleted = 0').get(user_id)?.c || 0
    return { success: true, hasRecords: b > 0 }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function deleteUser(id, admin_id) {
  try {
    if (isSuperadmin(id)) return { success: false, error: 'cannot_modify_superadmin' }
    if (id === admin_id) return { success: false, error: 'cannot_self_delete' }
    const userRow = db.prepare('SELECT username, role, is_active FROM users WHERE id = ?').get(id)
    if (!userRow) return { success: false, error: 'user_not_found' }

    // Guard: cannot deactivate the last active admin
    if (userRow.role === 'admin') {
      const activeAdmins = db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1"
      ).get().c
      if (activeAdmins <= 1) return { success: false, error: 'last_admin' }
    }

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id)

    writeAudit(id, 'UPDATE', { is_active: userRow.is_active },
      { message: `Deactivated user: ${userRow.username}` }, admin_id)

    try { statsHandlers.log({ user_id: admin_id, action_type: 'user_disabled', detail: { target: userRow.username } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function heartbeat(userId) {
  try {
    db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function updateProfile(userId, { full_name, email, phone }) {
  try {
    const old = db.prepare('SELECT full_name, email, phone FROM users WHERE id = ?').get(userId)
    if (!old) return { success: false, error: 'user_not_found' }

    db.prepare('UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?')
      .run(full_name?.trim() || old.full_name, email?.trim() || null, phone?.trim() || null, userId)

    writeAudit(userId, 'UPDATE', old,
      { message: `Profile updated by self` }, userId)

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getAll, create, update, resetPassword, setActive, getPermissions, setPermission, checkHasRecords, deleteUser, heartbeat, updateProfile }
