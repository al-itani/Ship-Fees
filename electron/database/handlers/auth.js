const bcrypt = require('bcryptjs')
const db = require('../db')

function login(username, password) {
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)
    if (!user) return { success: false, error: 'invalid_login' }
    if (!user.is_active) return { success: false, error: 'account_disabled' }

    const valid = bcrypt.compareSync(password, user.password_hash)
    if (!valid) return { success: false, error: 'invalid_login' }

    db.prepare("UPDATE users SET last_login = datetime('now'), is_online = 1, last_seen = datetime('now') WHERE id = ?").run(user.id)

    const permissions = db.prepare('SELECT permission_key FROM user_permissions WHERE user_id = ?')
      .all(user.id).map(r => r.permission_key)

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        language: user.language,
        must_change_password: user.must_change_password,
        permissions,
        perm_storage:         user.perm_storage         ?? 0,
        perm_automate:        user.perm_automate        ?? 0,
        perm_cma:             user.perm_cma             ?? 0,
        perm_tariff_c:        user.perm_tariff_c        ?? 0,
        perm_berthing:        user.perm_berthing        ?? 0,
        perm_container:       user.perm_container       ?? 0,
        perm_gc:              user.perm_gc              ?? 0,
        perm_receipt:         user.perm_receipt         ?? 0,
        perm_voyage:          user.perm_voyage          ?? 0,
        perm_receipt_archive: user.perm_receipt_archive ?? 0,
        perm_audit_log:       user.perm_audit_log       ?? 0,
        perm_staff_view:      user.perm_staff_view      ?? 0,
      },
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function changePassword(userId, newPassword) {
  try {
    const hash = bcrypt.hashSync(newPassword, 10)
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function logout(userId) {
  try {
    db.prepare("UPDATE users SET is_online = 0 WHERE id = ?").run(userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { login, changePassword, logout }
