const db = require('../db')

function getEntries({ action, table_name, user_id, date_from, date_to, limit = 50, offset = 0 } = {}) {
  try {
    const conditions = []
    const params = []

    if (action)     { conditions.push('a.action = ?');     params.push(action) }
    if (table_name) { conditions.push('a.table_name = ?'); params.push(table_name) }
    if (user_id)    { conditions.push('a.user_id = ?');    params.push(user_id) }
    if (date_from)  { conditions.push('a.created_at >= ?'); params.push(date_from) }
    if (date_to)    { conditions.push('a.created_at <= ?'); params.push(date_to + ' 23:59:59') }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    const rows = db.prepare(`
      SELECT a.id, a.table_name, a.record_id, a.action,
             a.old_data, a.new_data, a.created_at,
             u.username
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    const total = db.prepare(`
      SELECT COUNT(*) as c FROM audit_log a ${where}
    `).get(...params).c

    return { success: true, data: rows, total }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getFilterOptions() {
  try {
    const tables = db.prepare(
      `SELECT DISTINCT table_name FROM audit_log ORDER BY table_name`
    ).all().map(r => r.table_name)

    const users = db.prepare(
      `SELECT DISTINCT u.id, u.username FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE u.username IS NOT NULL ORDER BY u.username`
    ).all()

    return { success: true, tables, users }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Writes the single grouped entry for a bulk AI import (berthing + service lines).
// Called once per voyage after all rows are saved, so the log shows one line per
// import instead of one per inserted record.
function logImport({ voyageNumber, berthingCount = 0, serviceCount = 0, userId = null } = {}) {
  try {
    const parts = []
    if (berthingCount) parts.push(`${berthingCount} berthing record${berthingCount === 1 ? '' : 's'}`)
    if (serviceCount)  parts.push(`${serviceCount} service line${serviceCount === 1 ? '' : 's'}`)
    const what = parts.join(' + ') || 'no records'
    const summary = `Bulk import: ${what} — Voyage ${voyageNumber}`
    db.prepare(`
      INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
      VALUES ('import', 0, 'INSERT', NULL, ?, ?)
    `).run(JSON.stringify({ summary, voyage: voyageNumber }), userId || null)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getEntries, getFilterOptions, logImport }
