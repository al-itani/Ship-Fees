const db = require('../db')

const SYSTEM_CODES = new Set(['AUTOM', 'BILLF', 'STAMP'])

function writeAudit(tableName, recordId, action, oldData, newData, userId) {
  db.prepare(`INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(tableName, recordId, action,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      userId)
}

function submitUnknownCodes(lines, type, submittedBy) {
  const table = type === 'container' ? 'container_codes' : 'gc_codes'
  for (const line of lines) {
    const code = (line.service_code || '').trim().toUpperCase()
    if (!code || SYSTEM_CODES.has(code)) continue
    const exists = db.prepare(`SELECT 1 FROM ${table} WHERE UPPER(code) = ?`).get(code)
    if (exists) continue
    const already = db.prepare(`SELECT 1 FROM pending_codes WHERE code = ? AND type = ? AND status = 'pending'`).get(code, type)
    if (already) continue
    db.prepare(`INSERT INTO pending_codes (code, description, price, unit, type, submitted_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(code, line.description || null, line.price_per_unit ?? line.rate ?? null, line.unit || null, type, submittedBy || null)
  }
}

function getAll() {
  try {
    const rows = db.prepare(`
      SELECT pc.*, u.username as submitted_by_username
      FROM pending_codes pc
      LEFT JOIN users u ON u.id = pc.submitted_by
      WHERE pc.status = 'pending'
      ORDER BY pc.type, pc.submitted_at DESC
    `).all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getCount() {
  try {
    const { c } = db.prepare(`SELECT COUNT(*) as c FROM pending_codes WHERE status = 'pending'`).get()
    return { success: true, count: c }
  } catch (err) {
    return { success: false, count: 0 }
  }
}

function approve(id, reviewerId) {
  try {
    const pc = db.prepare(`SELECT * FROM pending_codes WHERE id = ? AND status = 'pending'`).get(id)
    if (!pc) return { success: false, error: 'Not found or already reviewed' }
    db.transaction(() => {
      if (pc.type === 'container') {
        db.prepare(`INSERT OR IGNORE INTO container_codes (code, description, default_rate_20, default_rate_40, is_taxable, is_fixed, is_active) VALUES (?, ?, ?, ?, 0, 0, 1)`)
          .run(pc.code, pc.description || pc.code, pc.price || 0, pc.price || 0)
      } else {
        db.prepare(`INSERT OR IGNORE INTO gc_codes (code, description, rate, unit, is_taxable, is_fixed, is_active) VALUES (?, ?, ?, ?, 0, 0, 1)`)
          .run(pc.code, pc.description || pc.code, pc.price || 0, pc.unit || null)
      }
      db.prepare(`UPDATE pending_codes SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`).run(reviewerId, id)
      writeAudit('pending_codes', id, 'UPDATE', { status: 'pending' }, { status: 'approved', code: pc.code, type: pc.type }, reviewerId)
    })()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function reject(id, reviewerId) {
  try {
    const pc = db.prepare(`SELECT * FROM pending_codes WHERE id = ? AND status = 'pending'`).get(id)
    if (!pc) return { success: false, error: 'Not found or already reviewed' }
    db.prepare(`UPDATE pending_codes SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`).run(reviewerId, id)
    writeAudit('pending_codes', id, 'UPDATE', { status: 'pending' }, { status: 'rejected', code: pc.code, type: pc.type }, reviewerId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { submitUnknownCodes, getAll, getCount, approve, reject }
