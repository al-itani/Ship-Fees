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

function lookupVoyage(voyageNumber) {
  try {
    const berthing = db.prepare(`
      SELECT voyage_number, vessel_name, vessel_type, ata, atd, shipping_agent, bill_number
      FROM berthing_records
      WHERE voyage_number = ? AND is_deleted = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(voyageNumber)

    if (!berthing) return { success: false, error: 'voyage_not_found' }

    const voyage = db.prepare('SELECT module_type FROM voyages WHERE voyage_number = ?').get(voyageNumber)
    if (voyage && voyage.module_type === 'GC') {
      return { success: false, error: 'voyage_is_gc' }
    }

    // Block if another active Container voyage already has the same bill_number
    if (berthing.bill_number) {
      const dup = db.prepare(`
        SELECT br.voyage_number
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.is_deleted = 0
          AND v.module_type = 'Container'
          AND br.voyage_number != ?
          AND br.bill_number = ?
        LIMIT 1
      `).get(voyageNumber, berthing.bill_number)
      if (dup) return { success: false, error: 'container_duplicate_bill', existingVoyage: dup.voyage_number }
    }

    return { success: true, data: { berthing, moduleType: voyage?.module_type || null } }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getCodes() {
  try {
    const rows = db.prepare(`
      SELECT code, description, default_rate_20, default_rate_40, is_taxable, is_fixed, is_overtime
      FROM container_codes
      WHERE is_active = 1 AND is_fixed = 0
      ORDER BY code
    `).all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function saveSession(data) {
  try {
    const { voyageNumber, vesselName, vesselType, lines, created_by } = data
    if (!voyageNumber || !lines || lines.length === 0) {
      return { success: false, error: 'No lines to save' }
    }

    const insertLine = db.prepare(`
      INSERT INTO container_services
        (voyage_number, service_code, description, container_type, quantity, price_per_unit, line_total, is_taxable, is_fixed, is_auto, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const doSave = db.transaction(() => {
      // When called from Automate screen, replace existing user lines
      if (data.replaceUserLines) {
        db.prepare(
          `UPDATE container_services SET is_deleted = 1 WHERE voyage_number = ? AND is_fixed = 0 AND is_auto = 0 AND is_deleted = 0`
        ).run(voyageNumber)
      }

      for (const l of lines) {
        const qty   = isFinite(l.quantity)       ? l.quantity       : 1
        const price = isFinite(l.price_per_unit) ? l.price_per_unit : 0
        const total = isFinite(l.line_total)     ? l.line_total     : qty * price
        const r = insertLine.run(
          voyageNumber, l.service_code, l.description,
          l.container_type || '20ft', qty, price, total,
          l.is_taxable || 0, 0, 0, created_by
        )
        writeAudit('container_services', r.lastInsertRowid, 'INSERT', null, l, created_by)
      }

      // AUTOM, BILLF, STAMP(x1) — insert once per voyage only
      const hasAutoLines = db.prepare(
        `SELECT COUNT(*) as c FROM container_services WHERE voyage_number = ? AND (is_fixed = 1 OR is_auto = 1) AND is_deleted = 0`
      ).get(voyageNumber).c > 0
      if (!hasAutoLines) {
        const autom = insertLine.run(voyageNumber, 'AUTOM', 'Automation fee',   '20ft', 1, 1.00, 1.00, 0, 1, 0, created_by)
        const billf = insertLine.run(voyageNumber, 'BILLF', 'Billing fee',      '20ft', 1, 1.00, 1.00, 0, 1, 0, created_by)
        const stamp = insertLine.run(voyageNumber, 'STAMP', 'Government stamp', '20ft', 1, 2.00, 2.00, 0, 0, 1, created_by)
        writeAudit('container_services', autom.lastInsertRowid, 'INSERT', null, { code: 'AUTOM' }, created_by)
        writeAudit('container_services', billf.lastInsertRowid, 'INSERT', null, { code: 'BILLF' }, created_by)
        writeAudit('container_services', stamp.lastInsertRowid, 'INSERT', null, { code: 'STAMP', quantity: 1, is_auto: 1 }, created_by)
      }

      // Extra container STAMP(x3) — separate guard so it applies to existing voyages too
      const hasExtraStamp = db.prepare(
        `SELECT COUNT(*) as c FROM container_services WHERE voyage_number = ? AND service_code = 'STAMP' AND quantity = 3 AND is_auto = 1 AND is_deleted = 0`
      ).get(voyageNumber).c > 0
      if (!hasExtraStamp) {
        const stampExtra = insertLine.run(voyageNumber, 'STAMP', 'Government stamp', '20ft', 3, 2.00, 6.00, 0, 0, 1, created_by)
        writeAudit('container_services', stampExtra.lastInsertRowid, 'INSERT', null, { code: 'STAMP', quantity: 3, is_auto: 1 }, created_by)
      }

      // Upsert voyages
      const existing = db.prepare('SELECT id FROM voyages WHERE voyage_number = ?').get(voyageNumber)
      if (existing) {
        db.prepare("UPDATE voyages SET module_type = 'Container' WHERE voyage_number = ?").run(voyageNumber)
      } else {
        db.prepare(`
          INSERT INTO voyages (voyage_number, vessel_name, vessel_type, module_type)
          VALUES (?, ?, ?, 'Container')
        `).run(voyageNumber, vesselName || null, vesselType || null)
      }
    })

    doSave()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getLines(voyageNumber) {
  try {
    const rows = db.prepare(`
      SELECT cs.*
      FROM container_services cs
      WHERE cs.voyage_number = ? AND cs.is_deleted = 0
      ORDER BY
        (CASE WHEN cs.is_fixed = 1 OR cs.is_auto = 1 THEN 1 ELSE 0 END) ASC,
        cs.created_at ASC
    `).all(voyageNumber)
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function deleteLine(id, userId) {
  try {
    const old = db.prepare('SELECT * FROM container_services WHERE id = ? AND is_deleted = 0').get(id)
    if (!old) return { success: false, error: 'Not found' }
    if (old.is_fixed || old.is_auto) return { success: false, error: 'cannot_delete_system_line' }

    db.prepare('UPDATE container_services SET is_deleted = 1 WHERE id = ?').run(id)
    writeAudit('container_services', id, 'DELETE', old, { is_deleted: 1 }, userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function listVoyages() {
  try {
    const rows = db.prepare(`
      SELECT voyage_number, vessel_name
      FROM berthing_records
      WHERE is_deleted = 0
      GROUP BY voyage_number
      ORDER BY MAX(rowid) DESC
    `).all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { lookupVoyage, getCodes, saveSession, getLines, deleteLine, listVoyages }
