const db = require('../db')

function writeAudit(recordId, action, oldData, newData, userId) {
  db.prepare(
    `INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id) VALUES ('ships', ?, ?, ?, ?, ?)`
  ).run(
    recordId, action,
    oldData ? JSON.stringify(oldData) : null,
    newData ? JSON.stringify(newData) : null,
    userId || null
  )
}

function getAll() {
  try {
    const rows = db.prepare('SELECT id, name, loa FROM ships WHERE is_deleted = 0 ORDER BY name ASC').all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function create(name, loa, userId) {
  try {
    const info = db.prepare('INSERT INTO ships (name, loa) VALUES (?, ?)').run(name.trim(), loa || null)
    writeAudit(info.lastInsertRowid, 'INSERT', null, { name: name.trim(), loa }, userId)
    return { success: true, id: info.lastInsertRowid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function update(id, name, loa, userId) {
  try {
    const old = db.prepare('SELECT name, loa FROM ships WHERE id = ?').get(id)
    db.prepare('UPDATE ships SET name = ?, loa = ? WHERE id = ?').run(name.trim(), loa || null, id)
    writeAudit(id, 'UPDATE', old, { name: name.trim(), loa }, userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function softDelete(id, userId) {
  try {
    const old = db.prepare('SELECT name, loa FROM ships WHERE id = ?').get(id)
    db.prepare('UPDATE ships SET is_deleted = 1 WHERE id = ?').run(id)
    writeAudit(id, 'DELETE', old, null, userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getAll, create, update, softDelete }
