const db = require('../db')

function writeAudit(tableName, recordId, action, oldData, newData, userId) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    tableName, recordId, action,
    oldData ? JSON.stringify(oldData) : null,
    newData ? JSON.stringify(newData) : null,
    userId
  )
}

function getDataForReceipt(voyageNumber) {
  try {
    const voyage = db.prepare(
      'SELECT id, voyage_number, module_type FROM voyages WHERE voyage_number = ? AND is_deleted = 0'
    ).get(voyageNumber)

    if (!voyage) return { success: false, error: 'voyage_not_found' }
    if (!voyage.module_type) return { success: false, error: 'no_module_type' }

    const header = db.prepare(`
      SELECT voyage_number, vessel_name, vessel_type, flag, shipping_agent, ata, atd, loa, position
      FROM berthing_records
      WHERE voyage_number = ? AND is_deleted = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(voyageNumber)

    if (!header) return { success: false, error: 'no_berthing_records' }

    const berthingRows = db.prepare(`
      SELECT id, position, loa, days, final_fee
      FROM berthing_records
      WHERE voyage_number = ? AND is_deleted = 0
      ORDER BY created_at ASC
    `).all(voyageNumber)

    let serviceRows = []
    if (voyage.module_type === 'GC') {
      serviceRows = db.prepare(`
        SELECT id, service_code, unit, quantity, rate AS price_per_unit, line_total,
               is_taxable, is_fixed, is_auto
        FROM gc_services
        WHERE voyage_number = ? AND is_deleted = 0
        ORDER BY (CASE WHEN is_fixed=1 OR is_auto=1 THEN 1 ELSE 0 END) ASC, created_at ASC
      `).all(voyageNumber)
    } else {
      serviceRows = db.prepare(`
        SELECT id, service_code, description, container_type, quantity, price_per_unit, line_total,
               is_taxable, is_fixed, is_auto
        FROM container_services
        WHERE voyage_number = ? AND is_deleted = 0
        ORDER BY (CASE WHEN is_fixed=1 OR is_auto=1 THEN 1 ELSE 0 END) ASC, created_at ASC
      `).all(voyageNumber)
    }

    if (serviceRows.length === 0) return { success: false, error: 'no_service_records' }

    const existingReceipt = db.prepare(
      'SELECT id, generated_at FROM receipts WHERE voyage_number = ? AND is_deleted = 0'
    ).get(voyageNumber)

    return {
      success: true,
      data: {
        voyageId: voyage.id,
        header,
        berthingRows,
        serviceRows,
        moduleType: voyage.module_type,
        existingReceipt: existingReceipt || null,
      },
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function saveReceipt(data) {
  try {
    const {
      voyage_id, voyage_number, bill_number,
      berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
      price, fundable, fresh_amount, final_price, generated_by,
    } = data

    const doSave = db.transaction(() => {
      const old = db.prepare(
        'SELECT id FROM receipts WHERE voyage_number = ? AND is_deleted = 0'
      ).get(voyage_number)
      if (old) {
        db.prepare('UPDATE receipts SET is_deleted = 1 WHERE id = ?').run(old.id)
        writeAudit('receipts', old.id, 'DELETE', old, { is_deleted: 1 }, null)
      }

      const r = db.prepare(`
        INSERT INTO receipts (
          voyage_id, voyage_number, bill_number,
          berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
          price, fundable, fresh_amount, final_price,
          generated_by, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        voyage_id || null, voyage_number, bill_number,
        berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
        price, fundable, fresh_amount, final_price, generated_by
      )
      // generated_by is a username string; audit_log.user_id is an integer FK — pass null
      writeAudit('receipts', r.lastInsertRowid, 'INSERT', null, data, null)
      return r.lastInsertRowid
    })

    const id = doSave()
    return { success: true, id }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getAll() {
  try {
    const rows = db.prepare(`
      SELECT r.id, r.voyage_number, r.bill_number, r.final_price, r.generated_by, r.generated_at,
             br.vessel_name, br.shipping_agent, br.ata, br.atd
      FROM receipts r
      LEFT JOIN berthing_records br ON r.voyage_number = br.voyage_number AND br.is_deleted = 0
      WHERE r.is_deleted = 0
      GROUP BY r.id
      ORDER BY r.generated_at DESC
    `).all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function softDelete(id, userId) {
  try {
    const old = db.prepare('SELECT * FROM receipts WHERE id = ? AND is_deleted = 0').get(id)
    if (!old) return { success: false, error: 'Receipt not found' }
    db.prepare('UPDATE receipts SET is_deleted = 1 WHERE id = ?').run(id)
    writeAudit('receipts', id, 'DELETE', old, { is_deleted: 1 }, userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getDataForReceipt, saveReceipt, getAll, softDelete }
