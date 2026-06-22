const db = require('../db')
const statsHandlers = require('./stats')

function writeAudit(recordId, action, oldData, newData, userId) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES ('storage_records', ?, ?, ?, ?, ?)
  `).run(
    recordId, action,
    oldData ? JSON.stringify(oldData) : null,
    newData ? JSON.stringify(newData) : null,
    userId ?? null,
  )
}

function getAll() {
  try {
    const rows = db.prepare(`
      SELECT id, agency, cargo_type, status, days, vehicle_size, container_size, tons,
             arrival_date, departure_date, notes, fee, result_json, created_by, created_at
      FROM storage_records
      WHERE is_deleted = 0
      ORDER BY agency ASC
    `).all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getById(id) {
  try {
    const row = db.prepare('SELECT * FROM storage_records WHERE id = ? AND is_deleted = 0').get(id)
    if (!row) return { success: false, error: 'Not found' }
    return { success: true, data: row }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function saveRecord(data) {
  try {
    const {
      agency, cargo_type, status, days,
      vehicle_size, container_size, tons,
      arrival_date, departure_date, notes,
      fee, result_json, created_by,
    } = data

    const r = db.prepare(`
      INSERT INTO storage_records
        (agency, cargo_type, status, days, vehicle_size, container_size, tons,
         arrival_date, departure_date, notes, fee, result_json, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agency, cargo_type, status, days,
      vehicle_size || null, container_size || null, tons || null,
      arrival_date || null, departure_date || null, notes || null,
      fee, JSON.stringify(result_json), created_by,
    )

    try {
      writeAudit(r.lastInsertRowid, 'INSERT', null, {
        summary: `[STORAGE] New record — Agency: ${agency} | Cargo: ${cargo_type} | Fee: $${Number(fee).toFixed(2)}`,
      }, created_by)
    } catch {}

    try { statsHandlers.log({ username: created_by, action_type: 'storage_saved', detail: { agency, cargo_type } }) } catch {}
    return { success: true, id: r.lastInsertRowid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function updateRecord(id, data, userId) {
  try {
    const old = db.prepare('SELECT * FROM storage_records WHERE id = ? AND is_deleted = 0').get(id)
    if (!old) return { success: false, error: 'Record not found' }

    const {
      agency, cargo_type, status, days,
      vehicle_size, container_size, tons,
      arrival_date, departure_date, notes,
      fee, result_json,
    } = data

    db.prepare(`
      UPDATE storage_records SET
        agency=?, cargo_type=?, status=?, days=?,
        vehicle_size=?, container_size=?, tons=?,
        arrival_date=?, departure_date=?, notes=?,
        fee=?, result_json=?, updated_by=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      agency, cargo_type, status, days,
      vehicle_size || null, container_size || null, tons || null,
      arrival_date || null, departure_date || null, notes || null,
      fee, JSON.stringify(result_json), userId, id,
    )

    try {
      writeAudit(id, 'UPDATE', old, {
        summary: `[STORAGE] Updated record — Agency: ${agency} | Cargo: ${cargo_type} | Fee: $${Number(fee).toFixed(2)}`,
      }, userId)
    } catch {}

    try { statsHandlers.log({ username: userId, action_type: 'storage_saved', detail: { agency, cargo_type, action: 'update' } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function softDelete(id, userId) {
  try {
    const old = db.prepare('SELECT * FROM storage_records WHERE id = ? AND is_deleted = 0').get(id)
    if (!old) return { success: false, error: 'Not found' }

    db.prepare('UPDATE storage_records SET is_deleted = 1 WHERE id = ?').run(id)

    writeAudit(id, 'DELETE', old, {
      summary: `[STORAGE] Deleted record — Agency: ${old.agency} | Cargo: ${old.cargo_type} | Fee: $${Number(old.fee).toFixed(2)}`,
    }, userId)

    try { statsHandlers.log({ username: userId, action_type: 'storage_saved', detail: { agency: old.agency, action: 'delete' } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getAll, getById, saveRecord, updateRecord, softDelete }
