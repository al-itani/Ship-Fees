function r2(v) {
  return Math.round(v * 100) / 100
}

/**
 * Pure calculation engine for receipt generation.
 *
 * RS-prefixed lines excluded from every total and display.
 * Overtime lines (OT/OVERT or code ends -E) always treated as regular lines.
 * For GC voyages: STAMP is taxable (included in taxableSubtotal with QUAIT).
 * For Container voyages: no tax block; STAMP (qty 3, $6.00) goes into fixedTotal.
 * Fundable cap ($450): when hit, Rehabilitation Fee excluded from freshAmount.
 * Container voyages add $0.22 container tax to freshAmount before rounding.
 * Rounding rule: any decimal > 0 → ceiling; whole numbers unchanged.
 */
export function calculateReceipt({ berthingRows, serviceRows, moduleType }) {
  const isGC = moduleType === 'GC'

  // Fix 2: Exclude RS-prefixed lines entirely from receipt
  const rows = serviceRows.filter(r => !r.service_code.toUpperCase().startsWith('RS'))

  // Identify overtime lines — Port of Beirut codes end in "-E" (C1-E, C2-E, FRP-E, etc.)
  const isOT = r => /-E$/i.test(r.service_code) || /OT|OVERT/i.test(r.service_code)

  // ── Berthing ──────────────────────────────────────────────────────────────
  const berthingTotal = r2(berthingRows.reduce((s, r) => s + r.final_fee, 0))

  // ── Categorise service lines ───────────────────────────────────────────────
  const fixedLines    = rows.filter(r => r.is_fixed === 1)                             // AUTOM, BILLF
  const stampLines    = rows.filter(r => r.service_code === 'STAMP')                   // STAMP (is_auto=1)
  // Explicitly taxable non-STAMP user lines (e.g. QUAIT) — OT lines bypass taxable flag
  const strictTaxable = rows.filter(r => r.is_taxable === 1 && r.service_code !== 'STAMP' && !isOT(r))
  // For GC: taxableLines = QUAIT + STAMP. For Container: [] (no tax block)
  const taxableLines  = isGC ? [...strictTaxable, ...stampLines] : []
  // Regular user lines include OT lines regardless of their is_taxable flag
  const regularLines  = rows.filter(r =>
    !r.is_fixed && !r.is_auto && r.service_code !== 'STAMP' &&
    (isOT(r) || !r.is_taxable)
  )

  // ── Tax block (GC only) ────────────────────────────────────────────────────
  const taxableSubtotal = r2(taxableLines.reduce((s, r) => s + r.line_total, 0))
  const rehabFeeRaw = isGC ? r2((taxableSubtotal - 2) * 0.03511111) : 0
  const totalTax    = isGC
    ? r2(((0.11 * taxableSubtotal - 0.22) * 0.035) + 0.11 * taxableSubtotal)
    : 0

  // ── Core calculation ───────────────────────────────────────────────────────
  const price    = r2(berthingTotal + regularLines.reduce((s, r) => s + r.line_total, 0))
  const fundable = Math.min(r2(price * 0.035), 450)
  const fundableCapped = fundable >= 450

  // fixedTotal: for GC only AUTOM+BILLF (STAMP is in taxableSubtotal).
  // For Container AUTOM+BILLF+STAMP (no tax block).
  const systemForFixed = isGC ? fixedLines : [...fixedLines, ...stampLines]
  const fixedTotal = r2(systemForFixed.reduce((s, r) => s + r.line_total, 0))

  // Fix 3: Container voyages add $0.22 tax before rounding; GC gets $0
  const containerTax = isGC ? 0 : 0.22

  const freshAmount = r2(price + fundable + fixedTotal + taxableSubtotal + totalTax + containerTax)

  const finalPrice = Math.ceil(freshAmount)

  // Rehab exclusion when Fundable hit the $450 cap
  const rehabFee = fundableCapped ? 0 : rehabFeeRaw

  // ── Display helpers ────────────────────────────────────────────────────────
  const servicesSubtotal   = r2(rows.reduce((s, r) => s + r.line_total, 0))
  const userServiceLines   = rows.filter(r => !r.is_fixed && !r.is_auto)
  const systemServiceLines = rows.filter(r => r.is_fixed || r.is_auto)

  return {
    berthingTotal,
    servicesSubtotal,
    taxableSubtotal,
    rehabFee,
    totalTax,
    price,
    fundable,
    fixedTotal,
    freshAmount,
    finalPrice,
    fundableCapped,
    containerTax,
    userServiceLines,
    systemServiceLines,
    isGC,
  }
}
