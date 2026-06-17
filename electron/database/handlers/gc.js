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
      SELECT voyage_number, vessel_name, vessel_type, ata, atd, shipping_agent, loa
      FROM berthing_records
      WHERE voyage_number = ? AND is_deleted = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(voyageNumber)

    if (!berthing) return { success: false, error: 'voyage_not_found' }

    const voyage = db.prepare('SELECT module_type FROM voyages WHERE voyage_number = ?').get(voyageNumber)
    if (voyage && voyage.module_type === 'Container') {
      return { success: false, error: 'voyage_is_container' }
    }

    return { success: true, data: { berthing, moduleType: voyage?.module_type || null } }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getCodes() {
  try {
    const rows = db.prepare(`
      SELECT code, description, rate, minimum, unit, is_taxable, is_fixed, is_overtime
      FROM gc_codes
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
      INSERT INTO gc_services
        (voyage_number, service_code, unit, quantity, rate, minimum, line_total,
         minimum_applied, is_taxable, is_fixed, is_auto, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const doSave = db.transaction(() => {
      // When called from Automate screen, replace existing user lines
      if (data.replaceUserLines) {
        db.prepare(
          `UPDATE gc_services SET is_deleted = 1 WHERE voyage_number = ? AND is_fixed = 0 AND is_auto = 0 AND is_deleted = 0`
        ).run(voyageNumber)
      }

      for (const l of lines) {
        const r = insertLine.run(
          voyageNumber, l.service_code, l.unit || null,
          l.quantity, l.rate, l.minimum || 0, l.line_total,
          l.minimum_applied ? 1 : 0,
          l.is_taxable || 0, 0, 0, created_by
        )
        writeAudit('gc_services', r.lastInsertRowid, 'INSERT', null, l, created_by)
      }

      // Auto system lines — insert once per voyage only
      const hasAutoLines = db.prepare(
        `SELECT COUNT(*) as c FROM gc_services WHERE voyage_number = ? AND (is_fixed = 1 OR is_auto = 1) AND is_deleted = 0`
      ).get(voyageNumber).c > 0
      if (!hasAutoLines) {
        const autom = insertLine.run(voyageNumber, 'AUTOM', 'unit', 1, 1.00, 0, 1.00, 0, 0, 1, 0, created_by)
        const billf = insertLine.run(voyageNumber, 'BILLF', 'unit', 1, 1.00, 0, 1.00, 0, 0, 1, 0, created_by)
        const stamp = insertLine.run(voyageNumber, 'STAMP', 'Stamp', 1, 2.00, 0, 2.00, 0, 0, 0, 1, created_by)
        writeAudit('gc_services', autom.lastInsertRowid, 'INSERT', null, { code: 'AUTOM' }, created_by)
        writeAudit('gc_services', billf.lastInsertRowid, 'INSERT', null, { code: 'BILLF' }, created_by)
        writeAudit('gc_services', stamp.lastInsertRowid, 'INSERT', null, { code: 'STAMP', is_auto: 1 }, created_by)
      }

      // Upsert voyages
      const existing = db.prepare('SELECT id FROM voyages WHERE voyage_number = ?').get(voyageNumber)
      if (existing) {
        db.prepare("UPDATE voyages SET module_type = 'GC' WHERE voyage_number = ?").run(voyageNumber)
      } else {
        db.prepare(`
          INSERT INTO voyages (voyage_number, vessel_name, vessel_type, module_type)
          VALUES (?, ?, ?, 'GC')
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
      SELECT *
      FROM gc_services
      WHERE voyage_number = ? AND is_deleted = 0
      ORDER BY
        (CASE WHEN is_fixed = 1 OR is_auto = 1 THEN 1 ELSE 0 END) ASC,
        created_at ASC
    `).all(voyageNumber)
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function deleteLine(id, userId) {
  try {
    const old = db.prepare('SELECT * FROM gc_services WHERE id = ? AND is_deleted = 0').get(id)
    if (!old) return { success: false, error: 'Not found' }
    if (old.is_fixed || old.is_auto) return { success: false, error: 'cannot_delete_system_line' }

    db.prepare('UPDATE gc_services SET is_deleted = 1 WHERE id = ?').run(id)
    writeAudit('gc_services', id, 'DELETE', old, { is_deleted: 1 }, userId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function listVoyages() {
  try {
    const rows = db.prepare(`
      SELECT
        br.voyage_number,
        MAX(br.vessel_name)    AS vessel_name,
        MAX(br.shipping_agent) AS shipping_agent,
        MIN(gs.created_at)     AS date_processed
      FROM berthing_records br
      LEFT JOIN gc_services gs
        ON gs.voyage_number = br.voyage_number AND gs.is_deleted = 0
      WHERE br.is_deleted = 0
      GROUP BY br.voyage_number
      ORDER BY MAX(br.rowid) DESC
    `).all()
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { lookupVoyage, getCodes, saveSession, getLines, deleteLine, listVoyages }
