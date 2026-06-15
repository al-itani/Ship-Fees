// Shared AI-import pipeline used by both the single Automate flow and Batch Import:
// extraction-result mapping, fee breakdowns, validation, and insertion.
// All DB access still goes through window.api (IPC) — audit logging happens in the handlers.

import { calcBerthingFee, getLIndex } from '../../logic/berthingCalc.js'
import { calculateReceipt } from '../../logic/receiptCalc.js'

export const POSITIONS = ['Quay', 'P2', 'En Rade', 'Congestion']

export const POSITION_MAP = {
  'QUAY':           'Quay',
  'POS_1':          'Quay',
  'POS1':           'Quay',
  'P1':             'Quay',
  'P2':             'P2',
  'POS_2':          'P2',
  'POS2':           'P2',
  'EN RADE':        'En Rade',
  'ENRADE':         'En Rade',
  'EN-RADE':        'En Rade',
  'EN RADE FREE':   'Congestion',
  'ENRADE FREE':    'Congestion',
  'EN-RADE FREE':   'Congestion',
  'EN RADE LIBRE':  'Congestion',
  'CONGESTION':     'Congestion',
  'CONG':           'Congestion',
}

// Pos 3 / P3 is a free anchorage — no berthing fee, excluded from billing entirely
export const FREE_POSITION_KEYS = new Set(['P3', 'POS3', 'POS_3'])

export function normalizePosition(raw) {
  if (!raw) return ''
  const key = String(raw).toUpperCase().trim()
  return POSITION_MAP[key] ?? (POSITIONS.includes(raw) ? raw : '')
}

export function toDateInput(ddmmyyyy) {
  if (!ddmmyyyy) return ''
  const p = String(ddmmyyyy).split('/')
  if (p.length !== 3) return ''
  return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00`
}

export const EXTRACT_ERROR_KEYS = {
  no_api_key:             'import_error_no_key',
  invalid_api_key_format: 'import_error_invalid_key',
  invalid_api_key:        'import_error_invalid_key',
  network_error:          'import_error_network',
  invalid_json:           'import_error_json',
  empty_response:         'import_error_json',
}

// Maps a raw ai:extract result into the review-form shape.
export function buildReviewState(fields, uncertain, containerCodes, gcCodes) {
  const vesselType  = fields.vessel_type || ''
  const isContainer = vesselType.toLowerCase().includes('container')

  const form = {
    voyageNumber:   String(fields.voyage_number || ''),
    vesselName:     String(fields.vessel_name || ''),
    vesselType,
    flag:           fields.flag ? String(fields.flag) : 'Lebanon',
    shippingAgent:  String(fields.shipping_agent || ''),
    ata:            toDateInput(fields.ata),
    atd:            toDateInput(fields.atd),
    loa:            fields.loa != null ? String(fields.loa) : '',
    vesselCategory: '',
    maintenance:    'No',
  }

  const rawRows = (fields.berthing || [])
    .filter(b => !FREE_POSITION_KEYS.has(String(b.position || '').toUpperCase().trim()))
    .map(b => ({
      position: normalizePosition(b.position),
      days:     b.days != null ? String(Math.ceil(Number(b.days))) : '',
    }))
  const berthingRows = rawRows.length > 0 ? rawRows : [{ position: '', days: '' }]

  const servicesAfterRSFilter = (fields.services || [])
    .filter(s => s.code)
    .filter(s => !String(s.code).toUpperCase().startsWith('RS'))
    .map(s => {
      const code = String(s.code).toUpperCase().trim()
      if (code === 'C321')  return { ...s, code: 'C321-E' }
      if (code === 'TRSTD') return { ...s, code: 'TR-STD' }
      return s
    })

  const serviceLines = servicesAfterRSFilter.map(s => {
    if (isContainer) {
      const mc    = containerCodes.find(c => c.code.toLowerCase() === String(s.code).toLowerCase())
      const qty   = Number(s.quantity) || 1
      const ctype = s.container_size || null
      const defaultRate = ctype === '40ft' && mc?.default_rate_40 != null
        ? mc.default_rate_40
        : (mc?.default_rate_20 ?? 0)
      // Strip currency symbols/spaces before converting — Claude occasionally returns "$26.54"
      const rawPrice = parseFloat(String(s.price_per_unit ?? '').replace(/[$,\s]/g, ''))
      const price    = isFinite(rawPrice) ? rawPrice : defaultRate
      return {
        _type:          'container',
        service_code:   mc?.code || String(s.code).toUpperCase(),
        description:    mc?.description || '',
        container_type: ctype || '20ft',
        quantity:       qty,
        price_per_unit: price,
        line_total:     qty * price,
        is_taxable:     mc?.is_taxable || 0,
        _uncertain:     uncertain?.has('services') || !mc || !ctype,
      }
    } else {
      const mc      = gcCodes.find(c => c.code.toLowerCase() === String(s.code).toLowerCase())
      const qty     = Number(s.quantity) || 1
      const rawRate = parseFloat(String(s.price_per_unit ?? '').replace(/[$,\s]/g, ''))
      const rate    = isFinite(rawRate) ? rawRate : (mc?.rate ?? 0)
      const min   = mc?.minimum || 0
      const total = min > 0 ? Math.max(qty * rate, min) : qty * rate
      return {
        _type:           'gc',
        service_code:    mc?.code || String(s.code).toUpperCase(),
        description:     mc?.description || '',
        unit:            mc?.unit || '',
        quantity:        qty,
        rate,
        minimum:         min,
        line_total:      total,
        minimum_applied: min > 0 && qty * rate < min ? 1 : 0,
        is_taxable:      mc?.is_taxable || 0,
        _uncertain:      uncertain?.has('services') || !mc,
      }
    }
  })

  const uncertainFields = uncertain ? new Set(uncertain) : new Set()
  if (!fields.flag) uncertainFields.delete('flag')

  return { form, berthingRows, serviceLines, uncertainFields, isContainer }
}

// One breakdown per berthing row (null when the row is incomplete/invalid).
export function computeBreakdowns(berthingRows, form, ratesData) {
  if (!ratesData) return berthingRows.map(() => null)
  const loa = parseFloat(form.loa)

  // Step 1: compute per-row fees (calcBerthingFee applies per-row minimum internally)
  const rawBreakdowns = berthingRows.map(row => {
    const days = parseInt(row.days)
    if (!loa || loa <= 0 || !days || days <= 0 || !row.position) return null
    try {
      return calcBerthingFee({
        loa, days,
        position:       row.position,
        vesselCategory: form.vesselCategory || null,
        maintenance:    form.maintenance,
        rates:          ratesData.rates,
        minimums:       ratesData.minimums,
        categories:     ratesData.categories,
      })
    } catch { return null }
  })

  // Step 2: apply Quay minimum to the combined total (not per-row)
  const validIndices = rawBreakdowns.reduce((acc, bd, i) => { if (bd) acc.push(i); return acc }, [])
  if (validIndices.length === 0) return rawBreakdowns

  // Sum fees WITHOUT per-row minimum (feeAfterDiscount + maintenanceFee per row)
  const r2 = v => Math.round(v * 100) / 100
  const rawSum = validIndices.reduce((s, i) => s + rawBreakdowns[i].feeAfterDiscount + rawBreakdowns[i].maintenanceFee, 0)
  const quayMin = ratesData.minimums['Quay'][getLIndex(loa)]
  const correctedTotal = Math.max(rawSum, quayMin)

  if (correctedTotal === rawSum) {
    // No bump needed — strip the per-row minimum that calcBerthingFee applied
    return rawBreakdowns.map(bd => {
      if (!bd) return null
      const correctedFinalFee = r2(bd.feeAfterDiscount + bd.maintenanceFee)
      return { ...bd, appliedFee: bd.feeAfterDiscount, finalFee: correctedFinalFee }
    })
  }

  // Bump needed — distribute proportionally across valid rows
  const scaleFactor = correctedTotal / rawSum
  return rawBreakdowns.map(bd => {
    if (!bd) return null
    const correctedFinalFee = r2((bd.feeAfterDiscount + bd.maintenanceFee) * scaleFactor)
    return { ...bd, appliedFee: bd.feeAfterDiscount, finalFee: correctedFinalFee }
  })
}

// Same required-field rules the review screen enforces before Insert All.
export function validateReviewData(form, berthingRows, breakdowns) {
  const errors = {}
  if (!form.voyageNumber.trim()) errors.voyageNumber = true
  if (!form.vesselName.trim())   errors.vesselName   = true
  if (!form.shippingAgent)       errors.shippingAgent = true
  if (!form.ata)                 errors.ata           = true
  if (!form.atd)                 errors.atd           = true
  if (!form.loa || parseFloat(form.loa) <= 0) errors.loa = true

  const validRows = berthingRows
    .map((row, i) => ({ row, bd: breakdowns[i] }))
    .filter(({ row, bd }) => row.position && bd)
  if (validRows.length === 0) errors.berthing = true

  return { errors, validRows }
}

// Berthing upsert (by index, against existing records for the voyage) + service save
// with replaceUserLines — identical to the single-flow Insert All. Throws on failure.
export async function insertVoyage({ form, validRows, serviceLines, manualLines = [], userId }) {
  const voyageNumber = form.voyageNumber.trim()
  const commonPayload = {
    voyage_number:   voyageNumber,
    bill_number:     voyageNumber,
    vessel_name:     form.vesselName.trim(),
    vessel_type:     form.vesselType || null,
    flag:            form.flag || null,
    shipping_agent:  form.shippingAgent,
    ata:             form.ata,
    atd:             form.atd,
    loa:             parseFloat(form.loa),
    vessel_category: form.vesselCategory || null,
    maintenance:     form.maintenance,
  }

  const allBerthing = await window.api.getBerthingRecords()
  const existingRecords = allBerthing.success
    ? allBerthing.data.filter(r => r.voyage_number === voyageNumber && !r.is_deleted)
    : []

  let totalFee = 0
  for (let i = 0; i < validRows.length; i++) {
    const { row, bd } = validRows[i]
    const payload = {
      ...commonPayload,
      days:               Math.ceil(Number(row.days)),
      position:           row.position,
      l_index:            bd.lIndex,
      d1_days:            bd.d1Days,
      d2_days:            bd.d2Days,
      d3_days:            bd.d3Days,
      raw_fee:            bd.rawFee,
      discount_factor:    bd.discountFactor,
      fee_after_discount: bd.feeAfterDiscount,
      min_fee:            bd.minFee,
      late_fee:           0,
      maintenance_fee:    bd.maintenanceFee,
      final_fee:          bd.finalFee,
    }
    totalFee += bd.finalFee

    const bRes = existingRecords[i]
      ? await window.api.updateBerthing(existingRecords[i].id, { ...payload, updated_by: userId })
      : await window.api.saveBerthing({ ...payload, created_by: userId })
    if (!bRes.success) throw new Error(bRes.error || 'Error saving berthing')
  }

  const validManualLines = manualLines.filter(l => l.service_code)
  const allServiceLines = [...serviceLines, ...validManualLines]
  let servicesSaved = 0
  if (allServiceLines.length > 0) {
    const isContainer = allServiceLines[0]._type === 'container'
    const svc = { voyageNumber, vesselName: form.vesselName.trim(), vesselType: form.vesselType || null, lines: allServiceLines, created_by: userId, replaceUserLines: true }
    const sRes = isContainer
      ? await window.api.containerSaveSession(svc)
      : await window.api.gcSaveSession(svc)
    if (!sRes.success) throw new Error(sRes.error || 'Error saving services')
    servicesSaved = allServiceLines.length
  }

  return { voyageNumber, servicesSaved, berthingFee: totalFee }
}

// Saves a receipt to the DB and returns the data needed for PDF export.
// Returns { success: false, skip: true } if manual rates are detected (e.g. C34/C35).
export async function autoSaveReceipt(voyageNumber, username) {
  const res = await window.api.receiptGetData(voyageNumber)
  if (!res.success) return { success: false, error: res.error }

  const { voyageId, berthingRows, serviceRows, moduleType, header } = res.data

  // Skip if any user service line has a zero total with non-zero quantity —
  // indicates a code like C34/C35 whose rate must be entered manually.
  const userLines = serviceRows.filter(r =>
    !r.service_code.startsWith('RS') &&
    !r.is_fixed &&
    !r.is_auto &&
    r.service_code !== 'STAMP'
  )
  if (userLines.some(r => r.quantity > 0 && r.line_total === 0)) {
    return { success: false, skip: true, error: 'manual_rates_required' }
  }

  const calc = calculateReceipt({ berthingRows, serviceRows, moduleType })

  const saveRes = await window.api.receiptSave({
    voyage_id:         voyageId,
    voyage_number:     voyageNumber,
    bill_number:       voyageNumber,
    berthing_total:    calc.berthingTotal,
    services_subtotal: calc.servicesSubtotal,
    taxable_subtotal:  calc.taxableSubtotal,
    rehab_fee:         calc.rehabFee,
    total_tax:         calc.totalTax,
    price:             calc.price,
    fundable:          calc.fundable,
    fresh_amount:      calc.freshAmount,
    final_price:       calc.finalPrice,
    generated_by:      username || 'batch',
  })

  if (!saveRes.success) return { success: false, error: saveRes.error }

  return { success: true, rawData: res.data }
}
