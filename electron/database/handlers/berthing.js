const db = require('../db')
const { z } = require('zod')
const statsHandlers = require('./stats')

const berthingSchema = z.object({
  voyage_number:    z.string().min(1),
  bill_number:      z.string().min(1),
  vessel_name:      z.string().min(1),
  vessel_type:      z.string().optional().nullable(),
  roro_cargo_type:  z.string().optional().nullable(),
  flag:             z.string().optional().nullable(),
  shipping_agent:   z.string().min(1),
  ata:              z.string().min(1),
  atd:              z.string().min(1),
  loa:              z.number().positive(),
  days:             z.number().int().positive(),
  position:         z.enum(['Quay', 'P2', 'En Rade', 'Congestion']),
  vessel_category:  z.string().optional().nullable(),
  maintenance:      z.enum(['Yes', 'No']),
  l_index:          z.number().int(),
  d1_days:          z.number().int(),
  d2_days:          z.number().int(),
  d3_days:          z.number().int(),
  raw_fee:          z.number(),
  discount_factor:  z.number(),
  fee_after_discount: z.number(),
  min_fee:          z.number(),
  late_fee:         z.number(),
  maintenance_fee:  z.number(),
  final_fee:        z.number(),
  created_by:       z.number().int(),
})

function writeAudit(tableName, recordId, action, oldData, newData, userId) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    tableName, recordId, action,
    oldData  ? JSON.stringify(oldData)  : null,
    newData  ? JSON.stringify(newData)  : null,
    userId
  )
}

// Writes one human-readable audit entry. The plain-language description lives in
// new_data.summary; voyage is stored alongside so the log can show it per row.
function logAction(tableName, recordId, action, summary, voyage, userId) {
  writeAudit(tableName, recordId, action, null, { summary, voyage }, userId)
}

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getRates() {
  try {
    const rateRows = db.prepare('SELECT * FROM berthing_rates').all()
    const minRows  = db.prepare('SELECT * FROM berthing_minimums').all()
    const catRows  = db.prepare('SELECT * FROM vessel_categories').all()

    const rates = {}
    rateRows.forEach(r => {
      if (!rates[r.position]) rates[r.position] = {}
      if (!rates[r.position][r.tier]) rates[r.position][r.tier] = {}
      rates[r.position][r.tier][r.l_index] = r.rate
    })

    const minimums = {}
    minRows.forEach(r => {
      if (!minimums[r.position]) minimums[r.position] = {}
      minimums[r.position][r.l_index] = r.min_fee
    })

    const categories = {}
    catRows.forEach(r => { categories[r.name] = r.discount_factor })

    return { success: true, data: { rates, minimums, categories } }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getAgents() {
  try {
    const rows = db.prepare('SELECT name FROM shipping_agents ORDER BY name').all()
    return { success: true, data: rows.map(r => r.name) }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function save(data) {
  try {
    const parsed = berthingSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const d = parsed.data
    const stmt = db.prepare(`
      INSERT INTO berthing_records (
        voyage_number, bill_number, vessel_name, vessel_type, roro_cargo_type, flag, shipping_agent,
        ata, atd, loa, days, position, vessel_category, maintenance,
        l_index, d1_days, d2_days, d3_days,
        raw_fee, discount_factor, fee_after_discount, min_fee,
        late_fee, maintenance_fee, final_fee, created_by
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    const result = stmt.run(
      d.voyage_number, d.bill_number, d.vessel_name, d.vessel_type || null, d.roro_cargo_type || null,
      d.flag || null, d.shipping_agent, d.ata, d.atd, d.loa, d.days, d.position,
      d.vessel_category || null, d.maintenance,
      d.l_index, d.d1_days, d.d2_days, d.d3_days,
      d.raw_fee, d.discount_factor, d.fee_after_discount, d.min_fee,
      d.late_fee, d.maintenance_fee, d.final_fee, d.created_by
    )
    if (!data._suppressAudit) {
      logAction('berthing_records', result.lastInsertRowid, 'INSERT',
        `Berthing saved — Voyage ${d.voyage_number}, ${money(d.final_fee)}`, d.voyage_number, d.created_by)
    }
    try { statsHandlers.log({ user_id: d.created_by, action_type: 'berthing_created', detail: { voyage: d.voyage_number } }) } catch {}
    return { success: true, id: result.lastInsertRowid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getAll() {
  try {
    const rows = db.prepare(`
      SELECT br.*,
        u1.full_name AS created_by_name,
        u2.full_name AS updated_by_name
      FROM berthing_records br
      LEFT JOIN users u1 ON br.created_by = u1.id
      LEFT JOIN users u2 ON br.updated_by = u2.id
      WHERE br.is_deleted = 0
      ORDER BY br.created_at DESC
    `).all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function update(id, data) {
  try {
    const updateSchema = berthingSchema.extend({ updated_by: z.number().int() }).omit({ created_by: true })
    const parsed = updateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const d = parsed.data
    const old = db.prepare('SELECT * FROM berthing_records WHERE id = ?').get(id)
    if (!old) return { success: false, error: 'Record not found' }

    db.prepare(`
      UPDATE berthing_records SET
        voyage_number=?, bill_number=?, vessel_name=?, vessel_type=?, roro_cargo_type=?, flag=?,
        shipping_agent=?, ata=?, atd=?, loa=?, days=?, position=?,
        vessel_category=?, maintenance=?,
        l_index=?, d1_days=?, d2_days=?, d3_days=?,
        raw_fee=?, discount_factor=?, fee_after_discount=?, min_fee=?,
        late_fee=?, maintenance_fee=?, final_fee=?,
        updated_by=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      d.voyage_number, d.bill_number, d.vessel_name, d.vessel_type || null, d.roro_cargo_type || null,
      d.flag || null, d.shipping_agent, d.ata, d.atd, d.loa, d.days, d.position,
      d.vessel_category || null, d.maintenance,
      d.l_index, d.d1_days, d.d2_days, d.d3_days,
      d.raw_fee, d.discount_factor, d.fee_after_discount, d.min_fee,
      d.late_fee, d.maintenance_fee, d.final_fee,
      d.updated_by, id
    )
    if (!data._suppressAudit) {
      logAction('berthing_records', id, 'UPDATE',
        `Edited berthing record — Voyage ${d.voyage_number}`, d.voyage_number, d.updated_by)
    }
    try { statsHandlers.log({ user_id: d.updated_by, action_type: 'berthing_updated', detail: { voyage: d.voyage_number } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function softDelete(id, userId, opts) {
  try {
    const old = db.prepare('SELECT * FROM berthing_records WHERE id = ? AND is_deleted = 0').get(id)
    if (!old) return { success: false, error: 'Record not found' }

    db.prepare(`
      UPDATE berthing_records
      SET is_deleted=1, deleted_by=?, deleted_at=datetime('now')
      WHERE id=?
    `).run(userId, id)
    if (!opts?.suppressAudit) {
      logAction('berthing_records', id, 'DELETE',
        `Deleted berthing record — Voyage ${old.voyage_number}`, old.voyage_number, userId)
    }
    try { statsHandlers.log({ user_id: userId, action_type: 'berthing_deleted', detail: { voyage: old.voyage_number } }) } catch {}
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getRates, getAgents, save, getAll, update, softDelete }
