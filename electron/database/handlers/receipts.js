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

// One human-readable audit entry per user action (summary stored in new_data).
function logAction(tableName, recordId, action, summary, voyage, userId) {
  writeAudit(tableName, recordId, action, null, { summary, voyage }, userId)
}

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseJson(value) {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

function inferTariffCMeta(row) {
  const audit = db.prepare(`
    SELECT new_data FROM audit_log
    WHERE table_name = 'receipts' AND record_id = ? AND action = 'INSERT'
    ORDER BY created_at DESC LIMIT 1
  `).get(row.id)
  const data = parseJson(audit?.new_data)
  const summary = data?.summary || ''
  const match = summary.match(/Tariff C\s+[—-]\s+(.+?)\s+\((.+?)\)/)
  return {
    agencyName: match?.[1] || null,
    period: match?.[2] || null,
  }
}

function getDataForReceipt(voyageNumber) {
  try {
    const voyage = db.prepare(
      'SELECT id, voyage_number, module_type FROM voyages WHERE voyage_number = ? AND is_deleted = 0'
    ).get(voyageNumber)

    if (!voyage) return { success: false, error: 'voyage_not_found' }
    if (!voyage.module_type) return { success: false, error: 'no_module_type' }

    const header = db.prepare(`
      SELECT voyage_number, vessel_name, vessel_type, roro_cargo_type, flag, shipping_agent, ata, atd, loa, position
      FROM berthing_records
      WHERE voyage_number = ? AND is_deleted = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(voyageNumber)

    if (!header) return { success: false, error: 'no_berthing_records' }

    const berthingRows = db.prepare(`
      SELECT id, position, loa, days, fee_after_discount, maintenance_fee, min_fee, final_fee
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
        // Regeneration replaces the old receipt silently — the new entry below covers the action.
        db.prepare('UPDATE receipts SET is_deleted = 1 WHERE id = ?').run(old.id)
      }

      const r = db.prepare(`
        INSERT INTO receipts (
          voyage_id, voyage_number, bill_number,
          berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
          price, fundable, fresh_amount, final_price,
          generated_by, generated_at, receipt_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), 'voyage')
      `).run(
        voyage_id || null, voyage_number, bill_number,
        berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
        price, fundable, fresh_amount, final_price, generated_by
      )
      // generated_by is a username string; audit_log.user_id is an integer FK — pass null
      logAction('receipts', r.lastInsertRowid, 'INSERT',
        `Receipt generated — Voyage ${voyage_number}, ${money(final_price)}`, voyage_number, null)
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
             r.receipt_type, r.snapshot_json,
             br.vessel_name, br.shipping_agent, br.ata, br.atd
      FROM receipts r
      LEFT JOIN berthing_records br ON br.id = (
        SELECT id FROM berthing_records
        WHERE voyage_number = r.voyage_number AND is_deleted = 0
        ORDER BY created_at ASC LIMIT 1
      )
      WHERE r.is_deleted = 0
      ORDER BY r.generated_at DESC
    `).all()
    return {
      success: true,
      data: rows.map(row => {
        const snapshot = parseJson(row.snapshot_json)
        return {
          ...row,
          display_name: row.receipt_type === 'tariff_c'
            ? (snapshot?.agencyData?.agencyName || inferTariffCMeta(row).agencyName || row.voyage_number)
            : row.vessel_name,
          display_agent: row.receipt_type === 'tariff_c'
            ? (snapshot?.period || inferTariffCMeta(row).period || '')
            : row.shipping_agent,
        }
      }),
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getById(id) {
  try {
    const row = db.prepare(`
      SELECT id, voyage_id, voyage_number, bill_number,
             berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
             price, fundable, fresh_amount, final_price,
             generated_by, generated_at, receipt_type, snapshot_json
      FROM receipts
      WHERE id = ? AND is_deleted = 0
    `).get(id)
    if (!row) return { success: false, error: 'Receipt not found' }

    const snapshot = parseJson(row.snapshot_json) || {}
    const meta = row.receipt_type === 'tariff_c' ? inferTariffCMeta(row) : {}
    return {
      success: true,
      data: {
        ...row,
        snapshot,
        agencyData: snapshot.agencyData || {
          agencyName: meta.agencyName || row.voyage_number,
          box: '',
          freeTEUsPerDay: '',
          monthlyFreeContainers: '',
          totalActualTEUs: '',
          dateUntil: '',
          storageAmount: row.price || row.services_subtotal || 0,
        },
        period: snapshot.period || meta.period || '',
        billingNumber: snapshot.billingNumber || row.bill_number,
        serviceRows: snapshot.serviceRows || [],
      },
    }
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

// Ensures a voyage exists as GC and the 3 auto lines are present so a
// berthing-only receipt can be generated without any Container/GC services.
// Safe to call on voyages that already have services — it does nothing in that case.
function prepareBerthingOnly(voyageNumber, username) {
  try {
    const br = db.prepare(
      'SELECT vessel_name, vessel_type FROM berthing_records WHERE voyage_number = ? AND is_deleted = 0 LIMIT 1'
    ).get(voyageNumber)
    if (!br) return { success: false, error: 'no_berthing_records' }

    // Upsert voyage with module_type = 'GC'; never overwrite an existing module_type
    const voyage = db.prepare(
      'SELECT id, module_type FROM voyages WHERE voyage_number = ? AND is_deleted = 0'
    ).get(voyageNumber)

    let voyageId
    if (!voyage) {
      const ins = db.prepare(
        "INSERT INTO voyages (voyage_number, vessel_name, module_type) VALUES (?, ?, 'GC')"
      ).run(voyageNumber, br.vessel_name || '')
      voyageId = ins.lastInsertRowid
    } else {
      voyageId = voyage.id
      if (!voyage.module_type) {
        db.prepare("UPDATE voyages SET module_type = 'GC' WHERE id = ?").run(voyageId)
      }
    }

    // Only insert auto lines for GC voyages with no existing services
    const moduleType = db.prepare('SELECT module_type FROM voyages WHERE id = ?').get(voyageId).module_type
    if (moduleType !== 'GC') return { success: true }

    const hasServices = db.prepare(
      'SELECT COUNT(*) as c FROM gc_services WHERE voyage_number = ? AND is_deleted = 0'
    ).get(voyageNumber).c > 0
    if (hasServices) return { success: true }

    const insertLine = db.prepare(`
      INSERT INTO gc_services
        (voyage_number, service_code, unit, quantity, rate, minimum, line_total, is_taxable, is_fixed, is_auto, created_by)
      VALUES (?, ?, 'unit', 1, ?, 0, ?, 0, ?, ?, ?)
    `)
    db.transaction(() => {
      insertLine.run(voyageNumber, 'AUTOM', 1.00, 1.00, 1, 0, username || 'system')
      insertLine.run(voyageNumber, 'BILLF', 1.00, 1.00, 1, 0, username || 'system')
      insertLine.run(voyageNumber, 'STAMP', 2.00, 2.00, 0, 1, username || 'system')
    })()

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getDataForReceipt, saveReceipt, getAll, getById, softDelete, prepareBerthingOnly }
