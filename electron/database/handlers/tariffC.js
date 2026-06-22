const db = require('../db')

function writeAudit(tableName, recordId, action, oldData, newData) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).run(
    tableName, recordId, action,
    oldData ? JSON.stringify(oldData) : null,
    newData ? JSON.stringify(newData) : null
  )
}

function formatExcelDate(val) {
  if (val instanceof Date && !isNaN(val)) {
    const d = val.getDate().toString().padStart(2, '0')
    const m = (val.getMonth() + 1).toString().padStart(2, '0')
    const y = val.getFullYear()
    return `${d}-${m}-${y}`
  }
  return String(val || '').trim()
}

function readFile(filePath) {
  try {
    const XLSX = require('xlsx')
    const wb = XLSX.readFile(filePath, { cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // Row index 1 (row 2 in Excel) col A = period label
    const period = rows[1] ? String(rows[1][0] || '').trim() : ''

    const agencies = []
    // Row indices 2–30 (rows 3–31 in Excel), skip row 32 (index 31)
    for (let i = 2; i <= 30 && i < rows.length; i++) {
      const row = rows[i]
      const agencyName = String(row[2] || '').trim()
      if (!agencyName) continue
      agencies.push({
        box:                   String(row[1] || '').trim(),
        agencyName,
        freeTEUsPerDay:        Number(row[3]) || 0,
        storageAmount:         Math.round((Number(row[4]) || 0) * 100) / 100,
        fullTEUsPrevMonth:     Number(row[5]) || 0,
        monthlyFreeContainers: Number(row[6]) || 0,
        totalActualTEUs:       Number(row[7]) || 0,
        dateUntil:             formatExcelDate(row[8]),
      })
    }

    return { success: true, data: { period, agencies } }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getNextBillingNumber() {
  try {
    const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'tariff_c_billing_counter'`).get()
    const current = row ? parseInt(row.value, 10) : 0
    return { success: true, next: current + 1 }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function saveReceipt(data) {
  try {
    const {
      agencyName, period, snapshot,
      berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
      price, fundable, fresh_amount, final_price, generated_by,
    } = data

    const doSave = db.transaction(() => {
      const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'tariff_c_billing_counter'`).get()
      const current = row ? parseInt(row.value, 10) : 0
      const billingNumber = current + 1

      db.prepare(`
        INSERT INTO app_settings (key, value) VALUES ('tariff_c_billing_counter', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(billingNumber))

      const voyageNumber = `TC-${billingNumber}`
      const snapshotJson = JSON.stringify({
        ...(snapshot || {}),
        period,
        billingNumber,
        agencyData: {
          ...(snapshot?.agencyData || {}),
          agencyName,
          storageAmount: snapshot?.agencyData?.storageAmount ?? price,
        },
      })
      const r = db.prepare(`
        INSERT INTO receipts (
          voyage_id, voyage_number, bill_number,
          berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
          price, fundable, fresh_amount, final_price,
          generated_by, generated_at, receipt_type, snapshot_json
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), 'tariff_c', ?)
      `).run(
        voyageNumber, String(billingNumber),
        berthing_total, services_subtotal, taxable_subtotal, rehab_fee, total_tax,
        price, fundable, fresh_amount, final_price, generated_by, snapshotJson
      )

      writeAudit('receipts', r.lastInsertRowid, 'INSERT', null, {
        summary: `Tariff C — ${agencyName} (${period}) — $${final_price}`,
        voyage: voyageNumber,
      })

      return { id: r.lastInsertRowid, billingNumber, voyageNumber }
    })

    const result = doSave()
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { readFile, getNextBillingNumber, saveReceipt }
