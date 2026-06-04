const db = require('../db')

const LOCAL_CODES = ['C1', 'C5', 'FRP', 'FRV', 'FCP', 'FCV', 'C1-E', 'FRP-E', 'FCP-E', 'C123', 'C321-E', 'C524', 'C425']
const TRANS_CODES = ['T-MSK1', 'T-MSK2', 'T-MSC', 'TR-STD', 'T-CMA', 'T-T21', 'T-SHS']

const LOCAL_RATE = 13.92
const TRANS_RATE = 9.05

const localIn = LOCAL_CODES.map(() => '?').join(',')
const transIn = TRANS_CODES.map(() => '?').join(',')

function computeDerived(row) {
  const localTeus = row.local_20 + row.local_40 * 2
  const transTeus = row.trans_20 + row.trans_40 * 2
  const localFee  = +( localTeus * LOCAL_RATE).toFixed(2)
  const transFee  = +( transTeus * TRANS_RATE).toFixed(2)
  return {
    ...row,
    local_teus: localTeus,
    trans_teus: transTeus,
    local_fee:  localFee,
    trans_fee:  transFee,
    total:      +(localFee + transFee).toFixed(2),
  }
}

function getReport(year, month) {
  try {
    const yyyy = String(year)
    const mm   = String(month).padStart(2, '0')

    const rows = db.prepare(`
      WITH voyage_agents AS (
        SELECT DISTINCT br.voyage_number, br.shipping_agent
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
      )
      SELECT
        va.shipping_agent AS agent,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${localIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS local_20,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${localIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS local_40,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS trans_20,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS trans_40
      FROM voyage_agents va
      LEFT JOIN container_services cs ON cs.voyage_number = va.voyage_number AND cs.is_deleted = 0
      GROUP BY va.shipping_agent
      ORDER BY va.shipping_agent
    `).all(yyyy, mm, ...LOCAL_CODES, ...LOCAL_CODES, ...TRANS_CODES, ...TRANS_CODES)

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
        SELECT DISTINCT
          br.voyage_number,
          br.shipping_agent,
          (SELECT vessel_name FROM berthing_records WHERE voyage_number = br.voyage_number AND is_deleted = 0 LIMIT 1) AS vessel_name,
          (SELECT bill_number FROM berthing_records WHERE voyage_number = br.voyage_number AND is_deleted = 0 LIMIT 1) AS bill_number
        FROM berthing_records br
        JOIN voyages v ON br.voyage_number = v.voyage_number
        WHERE br.is_deleted = 0 AND v.module_type = 'Container' AND v.is_deleted = 0
          AND br.shipping_agent = ?
          AND strftime('%Y', br.ata) = ? AND strftime('%m', br.ata) = ?
      )
      SELECT
        vl.vessel_name,
        vl.shipping_agent AS agent,
        vl.voyage_number,
        vl.bill_number,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${localIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS local_20,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${localIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS local_40,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '20ft' THEN cs.quantity ELSE 0 END), 0) AS trans_20,
        COALESCE(SUM(CASE WHEN cs.service_code IN (${transIn}) AND cs.container_type = '40ft' THEN cs.quantity ELSE 0 END), 0) AS trans_40
      FROM voyage_list vl
      LEFT JOIN container_services cs ON cs.voyage_number = vl.voyage_number AND cs.is_deleted = 0
      GROUP BY vl.voyage_number
      ORDER BY vl.voyage_number
    `).all(agent, yyyy, mm, ...LOCAL_CODES, ...LOCAL_CODES, ...TRANS_CODES, ...TRANS_CODES)

    return { success: true, data: rows.map(computeDerived) }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { getReport, getVoyageDetail, LOCAL_CODES, TRANS_CODES }
