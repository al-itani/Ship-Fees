const db = require('../db')
const statsHandlers = require('./stats')

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

function lookupVoyage(voyageNumber) {
  try {
    const berthing = db.prepare(`
      SELECT voyage_number, vessel_name, vessel_type, ata, atd, shipping_agent, bill_number, loa
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

    let firstLineId = 0
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
        if (!firstLineId) firstLineId = r.lastInsertRowid
      }

      // AUTOM, BILLF, STAMP(qty=1) — insert once per voyage only (system lines, not audited individually)
      const hasAutoLines = db.prepare(
        `SELECT COUNT(*) as c FROM container_services WHERE voyage_number = ? AND (is_fixed = 1 OR is_auto = 1) AND is_deleted = 0`
      ).get(voyageNumber).c > 0
      if (!hasAutoLines) {
        insertLine.run(voyageNumber, 'AUTOM', 'Automation fee',   '20ft', 1, 1.00, 1.00, 0, 1, 0, created_by)
        insertLine.run(voyageNumber, 'BILLF', 'Billing fee',      '20ft', 1, 1.00, 1.00, 0, 1, 0, created_by)
        insertLine.run(voyageNumber, 'STAMP', 'Government stamp', '20ft', 1, 2.00, 2.00, 0, 0, 1, created_by)
      }

      // Extra STAMP(qty=3) — separate guard so existing voyages with only qty=1 get backfilled to total qty=4
      const stampQtyTotal = db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) as t FROM container_services WHERE voyage_number = ? AND service_code = 'STAMP' AND is_auto = 1 AND is_deleted = 0`
      ).get(voyageNumber).t
      if (stampQtyTotal < 4) {
        const extraQty = 4 - stampQtyTotal
        const extraAmt = extraQty * 2.00
        insertLine.run(voyageNumber, 'STAMP', 'Government stamp', '20ft', extraQty, 2.00, extraAmt, 0, 0, 1, created_by)
      }

      // One grouped entry per save (suppressed during bulk import — logged there instead)
      if (!data.suppressAudit) {
        logAction('container_services', firstLineId, 'INSERT',
          `Container services saved — ${lines.length} line${lines.length === 1 ? '' : 's'}, Voyage ${voyageNumber}`,
          voyageNumber, created_by)
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
    try { statsHandlers.log({ user_id: created_by, action_type: 'container_saved', detail: { voyage: voyageNumber, lines: lines.length } }) } catch {}
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
    logAction('container_services', id, 'DELETE',
      `Deleted container service line ${old.service_code} — Voyage ${old.voyage_number}`, old.voyage_number, userId)
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
        COALESCE(MIN(cs.created_at), MIN(br.created_at)) AS date_processed
      FROM berthing_records br
      LEFT JOIN container_services cs
        ON cs.voyage_number = br.voyage_number AND cs.is_deleted = 0
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
