const db = require('../db')

// Standard local codes → $13.92/TEU USD, 479,260 L.L/TEU LBP
const STD_LOCAL_CODES = ['C1', 'C5', 'C1-E', 'FRP-E', 'FCP-E', 'C123', 'C321-E', 'C524', 'C425']
// FRP group → $10.45/TEU USD only, excluded from LBP
const FRP_CODES       = ['FRP', 'FRV', 'FCP', 'FCV']
// Combined for external callers (Excel export etc.)
const LOCAL_CODES     = [...STD_LOCAL_CODES, ...FRP_CODES]
const TRANS_CODES     = ['T-MSK1', 'T-MSK2', 'T-MSC', 'TR-STD', 'T-CMA', 'T-T21', 'T-SHS']

const STD_RATE   = 13.92
const FRP_RATE   = 10.45
const TRANS_RATE = 9.05

const stdIn   = STD_LOCAL_CODES.map(() => '?').join(',')
const frpIn   = FRP_CODES.map(() => '?').join(',')
const transIn = TRANS_CODES.map(() => '?').join(',')

// Params appended after date params: STD×2, FRP×2, TRANS×2
const CODE_PARAMS = [
  ...STD_LOCAL_CODES, ...STD_LOCAL_CODES,
  ...FRP_CODES, ...FRP_CODES,
  ...TRANS_CODES, ...TRANS_CODES,
]

const SHARED_SELECT = `
  COALESCE(SUM(CASE WHEN cs.service_code IN (${stdIn})   AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS std_local_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${stdIn})   AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS std_local_40,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${frpIn})   AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS frp_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${frpIn})   AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS frp_40,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS trans_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS trans_40
`

function computeDerived(row) {
  const stdTeus   = row.std_local_20 + row.std_local_40 * 2
  const frpTeus   = row.frp_20       + row.frp_40 * 2
  const transTeus = row.trans_20     + row.trans_40 * 2

  const localFee = +(stdTeus * STD_RATE + frpTeus * FRP_RATE).toFixed(2)
  const transFee = +(transTeus * TRANS_RATE).toFixed(2)

  return {
    ...row,
    local_20:       row.std_local_20 + row.frp_20,
    local_40:       row.std_local_40 + row.frp_40,
    local_teus:     stdTeus + frpTeus,
    std_local_teus: stdTeus,   // used by frontend for LBP calc
    frp_teus:       frpTeus,
    trans_teus:     transTeus,
    local_fee:      localFee,
    trans_fee:      transFee,
    total:          +(localFee + transFee).toFixed(2),
  }
}

function getReport(year, month) {
  try {
    const yyyy = String(year)
    const mm   = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_agents AS (
        SELECT br.voyage_number, br.shipping_agent
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT va.shipping_agent AS agent, ${SHARED_SELECT}
      FROM voyage_agents va
      LEFT JOIN container_services cs ON cs.voyage_number = va.voyage_number AND cs.is_deleted = 0
      GROUP BY va.shipping_agent
      ORDER BY va.shipping_agent
    `).all(yyyy, mm, ...CODE_PARAMS)
    return { success: true, data: rows.map(computeDerived) }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getVoyageDetail(year, month, agent) {
  try {
    const yyyy = String(year)
    const mm   = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_list AS (
        SELECT br.voyage_number, br.shipping_agent, br.vessel_name, br.bill_number
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND br.shipping_agent = ?
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT vl.vessel_name, vl.shipping_agent AS agent, vl.voyage_number, vl.bill_number, ${SHARED_SELECT}
      FROM voyage_list vl
      LEFT JOIN container_services cs ON cs.voyage_number = vl.voyage_number AND cs.is_deleted = 0
      GROUP BY vl.voyage_number
      ORDER BY vl.voyage_number
    `).all(agent, yyyy, mm, ...CODE_PARAMS)
    return { success: true, data: rows.map(computeDerived) }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

const TRS_SELECT = `
  COALESCE(SUM(CASE WHEN cs.service_code IN (${stdIn})   AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS std_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${stdIn})   AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS std_40,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${frpIn})   AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS frp_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${frpIn})   AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS frp_40,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS trans_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS trans_40
`

function computeTrsDerived(row) {
  const stdTeus   = row.std_20  + row.std_40  * 2
  const frpTeus   = row.frp_20  + row.frp_40  * 2
  const transTeus = row.trans_20 + row.trans_40 * 2

  const localFee = +(stdTeus * STD_RATE + frpTeus * FRP_RATE).toFixed(2)
  const transFee = +(transTeus * TRANS_RATE).toFixed(2)

  return {
    ...row,
    local_20:   row.std_20  + row.frp_20,
    local_40:   row.std_40  + row.frp_40,
    local_teus: stdTeus + frpTeus,
    trans_teus: transTeus,
    std_teus:   stdTeus,
    frp_teus:   frpTeus,
    local_fee:  localFee,
    trans_fee:  transFee,
    total:      +(localFee + transFee).toFixed(2),
    local_lbp:  +(stdTeus * 479260).toFixed(2),
    trans_lbp:  +(transTeus * 311519).toFixed(2),
  }
}

function getTrsReport(year, month) {
  try {
    const yyyy = String(year)
    const mm   = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_list AS (
        SELECT br.voyage_number, br.shipping_agent
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT vl.voyage_number, vl.shipping_agent AS agent, ${TRS_SELECT}
      FROM voyage_list vl
      LEFT JOIN container_services cs ON cs.voyage_number = vl.voyage_number AND cs.is_deleted = 0
      GROUP BY vl.voyage_number
      ORDER BY vl.voyage_number
    `).all(yyyy, mm, ...CODE_PARAMS)
    return { success: true, data: rows.map(computeTrsDerived) }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

const N_CODES = ['N1','N2','N3','N4','N5','N6','N7','N8','N9','N10']
const nIn = N_CODES.map(() => '?').join(',')

function getGCReport(year, month) {
  try {
    const yyyy = String(year)
    const mm   = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_agents AS (
        SELECT br.voyage_number, br.shipping_agent, br.vessel_name
        FROM berthing_records br
        JOIN voyages v ON v.voyage_number = br.voyage_number AND v.is_deleted = 0 AND v.module_type = 'Container'
        WHERE br.is_deleted = 0
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT va.voyage_number, va.shipping_agent, va.vessel_name, cs.service_code, cs.line_total
      FROM voyage_agents va
      JOIN container_services cs ON cs.voyage_number = va.voyage_number AND cs.is_deleted = 0
      WHERE cs.service_code IN (${nIn})
      ORDER BY va.voyage_number, cs.service_code
    `).all(yyyy, mm, ...N_CODES)

    const voyageMap = new Map()
    for (const row of rows) {
      if (!voyageMap.has(row.voyage_number)) {
        voyageMap.set(row.voyage_number, { voyage_number: row.voyage_number, shipping_agent: row.shipping_agent, vessel_name: row.vessel_name, lines: [] })
      }
      voyageMap.get(row.voyage_number).lines.push({
        service_code: row.service_code,
        original: row.line_total,
        billable: +(row.line_total * 0.35).toFixed(2),
      })
    }
    const data = Array.from(voyageMap.values()).map(v => ({
      ...v,
      subtotal: +v.lines.reduce((s, l) => s + l.billable, 0).toFixed(2),
    }))
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ── Normal Receipt (Tab 1) — C1/C5/C1-E/C123/C321-E/C524/C425 + Transit ─────
const NORMAL_CODES  = ['C1', 'C5', 'C1-E', 'C123', 'C321-E', 'C524', 'C425']
const normIn        = NORMAL_CODES.map(() => '?').join(',')
const NORM_PARAMS   = [...NORMAL_CODES, ...NORMAL_CODES, ...TRANS_CODES, ...TRANS_CODES]

const NORM_SELECT = `
  COALESCE(SUM(CASE WHEN cs.service_code IN (${normIn})  AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS local_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${normIn})  AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS local_40,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS trans_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS trans_40
`

function computeNormDerived(row) {
  const localTeus = row.local_20 + row.local_40 * 2
  const transTeus = row.trans_20 + row.trans_40 * 2
  const localFee  = +(localTeus * STD_RATE).toFixed(2)
  const transFee  = +(transTeus * TRANS_RATE).toFixed(2)
  return {
    ...row,
    local_teus: localTeus,
    trans_teus: transTeus,
    local_fee:  localFee,
    trans_fee:  transFee,
    total:      +(localFee + transFee).toFixed(2),
    local_lbp:  +(localTeus * 479260).toFixed(2),
    trans_lbp:  +(transTeus * 311519).toFixed(2),
  }
}

function getNormalReport(year, month) {
  try {
    const yyyy = String(year), mm = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_agents AS (
        SELECT br.voyage_number, br.shipping_agent
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT va.shipping_agent AS agent, ${NORM_SELECT}
      FROM voyage_agents va
      LEFT JOIN container_services cs ON cs.voyage_number = va.voyage_number AND cs.is_deleted = 0
      GROUP BY va.shipping_agent
      ORDER BY va.shipping_agent
    `).all(yyyy, mm, ...NORM_PARAMS)
    return { success: true, data: rows.map(computeNormDerived) }
  } catch (err) { return { success: false, error: err.message } }
}

function getNormalVoyageDetail(year, month, agent) {
  try {
    const yyyy = String(year), mm = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_list AS (
        SELECT br.voyage_number, br.shipping_agent, br.vessel_name, br.bill_number
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND br.shipping_agent = ?
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT vl.vessel_name, vl.shipping_agent AS agent, vl.voyage_number, vl.bill_number, ${NORM_SELECT}
      FROM voyage_list vl
      LEFT JOIN container_services cs ON cs.voyage_number = vl.voyage_number AND cs.is_deleted = 0
      GROUP BY vl.voyage_number
      ORDER BY vl.voyage_number
    `).all(agent, yyyy, mm, ...NORM_PARAMS)
    return { success: true, data: rows.map(computeNormDerived) }
  } catch (err) { return { success: false, error: err.message } }
}

function getNormalTrsReport(year, month) {
  try {
    const yyyy = String(year), mm = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_list AS (
        SELECT br.voyage_number, br.shipping_agent
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT vl.voyage_number, vl.shipping_agent AS agent, ${NORM_SELECT}
      FROM voyage_list vl
      LEFT JOIN container_services cs ON cs.voyage_number = vl.voyage_number AND cs.is_deleted = 0
      GROUP BY vl.voyage_number
      ORDER BY vl.voyage_number
    `).all(yyyy, mm, ...NORM_PARAMS)
    return { success: true, data: rows.map(computeNormDerived) }
  } catch (err) { return { success: false, error: err.message } }
}

// ── FRP Receipt (Tab 2) — FRP/FRV/FCP/FCV/FRP-E/FCP-E, local only ───────────
const FRP_ONLY_CODES  = ['FRP', 'FRV', 'FCP', 'FCV', 'FRP-E', 'FCP-E']
const frpOnlyIn       = FRP_ONLY_CODES.map(() => '?').join(',')
const FRP_ONLY_PARAMS = [...FRP_ONLY_CODES, ...FRP_ONLY_CODES]

const FRP_ONLY_SELECT = `
  COALESCE(SUM(CASE WHEN cs.service_code IN (${frpOnlyIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS frp_20,
  COALESCE(SUM(CASE WHEN cs.service_code IN (${frpOnlyIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS frp_40
`

function computeFrpDerived(row) {
  const frpTeus = row.frp_20 + row.frp_40 * 2
  return { ...row, frp_teus: frpTeus, fee: +(frpTeus * FRP_RATE).toFixed(2) }
}

function getFrpReport(year, month) {
  try {
    const yyyy = String(year), mm = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_agents AS (
        SELECT br.voyage_number, br.shipping_agent
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT va.shipping_agent AS agent, ${FRP_ONLY_SELECT}
      FROM voyage_agents va
      LEFT JOIN container_services cs ON cs.voyage_number = va.voyage_number AND cs.is_deleted = 0
      GROUP BY va.shipping_agent
      ORDER BY va.shipping_agent
    `).all(yyyy, mm, ...FRP_ONLY_PARAMS)
    return { success: true, data: rows.map(computeFrpDerived) }
  } catch (err) { return { success: false, error: err.message } }
}

function getFrpVoyageDetail(year, month, agent) {
  try {
    const yyyy = String(year), mm = String(month).padStart(2, '0')
    const rows = db.prepare(`
      WITH voyage_list AS (
        SELECT br.voyage_number, br.shipping_agent, br.vessel_name, br.bill_number
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND br.shipping_agent = ?
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
        GROUP BY br.voyage_number
      )
      SELECT vl.vessel_name, vl.shipping_agent AS agent, vl.voyage_number, vl.bill_number, ${FRP_ONLY_SELECT}
      FROM voyage_list vl
      LEFT JOIN container_services cs ON cs.voyage_number = vl.voyage_number AND cs.is_deleted = 0
      GROUP BY vl.voyage_number
      ORDER BY vl.voyage_number
    `).all(agent, yyyy, mm, ...FRP_ONLY_PARAMS)
    return { success: true, data: rows.map(computeFrpDerived) }
  } catch (err) { return { success: false, error: err.message } }
}

module.exports = {
  getReport, getVoyageDetail, getGCReport, getTrsReport,
  getNormalReport, getNormalVoyageDetail, getNormalTrsReport,
  getFrpReport, getFrpVoyageDetail,
  LOCAL_CODES, TRANS_CODES,
}
