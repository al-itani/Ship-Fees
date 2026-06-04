const bcrypt = require('bcryptjs')
const db = require('../db')

function writeAudit(recordId, action, oldData, newData, userId) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES ('users', ?, ?, ?, ?, ?)
  `).run(recordId, action, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null, userId)
}

function getAll() {
  try {
    const users = db.prepare(`
      SELECT id, username, full_name, role, language, is_active, must_change_password,
             created_at, last_login, created_by
      FROM users
      ORDER BY role DESC, username ASC
    `).all()
    return { success: true, data: users }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function create({ username, full_name, role, language, temp_password, admin_id }) {
  try {
    const uname = username.toLowerCase().trim()
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

    return { success: true, id: result.lastInsertRowid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function update(id, { full_name, role, language }, admin_id) {
  try {
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

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function resetPassword(id, temp_password, admin_id) {
  try {
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(id)
    if (!userRow) return { success: false, error: 'user_not_found' }

    const hash = bcrypt.hashSync(temp_password, 10)
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, id)

    writeAudit(id, 'UPDATE', null,
      { message: `Password reset for: ${userRow.username}` }, admin_id)

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function setActive(id, isActive, admin_id) {
  try {
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

function setPermission(user_id, permission_key, grant, admin_id) {
  try {
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(user_id)
    if (!userRow) return { success: false, error: 'user_not_found' }

    if (grant) {
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
    if (id === admin_id) return { success: false, error: 'cannot_self_delete' }
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(id)
    if (!userRow) return { success: false, error: 'user_not_found' }

    const check = checkHasRecords(id)
    if (!check.success) return check
    if (check.hasRecords) return { success: false, error: 'has_records' }

    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id)

    writeAudit(id, 'DELETE', { username: userRow.username },
      { message: `Deleted user: ${userRow.username}` }, admin_id)

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getAll, create, update, resetPassword, setActive, getPermissions, setPermission, checkHasRecords, deleteUser }
