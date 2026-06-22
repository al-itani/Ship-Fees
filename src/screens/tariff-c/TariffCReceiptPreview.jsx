import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import { calculateReceipt } from '../../logic/receiptCalc.js'
import portLogo from '../../assets/port-logo.jpg'

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtInt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const T_CELL = { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #E8ECF4', verticalAlign: 'middle' }
const T_HEAD = { padding: '7px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                 letterSpacing: '0.04em', color: '#1B2A4A', background: '#F0F4FF',
                 borderBottom: '2px solid #D0D8EC' }
const LABEL_S = { fontSize: 11, color: '#6C757D', fontWeight: 500 }
const VALUE_S  = { fontSize: 12, fontWeight: 600, color: '#1A1A2E' }

function InfoRow({ label, value }) {
  return (
    <tr>
      <td style={{ ...T_CELL, ...LABEL_S, paddingTop: 4, paddingBottom: 4, whiteSpace: 'nowrap', width: 200 }}>{label}</td>
      <td style={{ ...T_CELL, ...VALUE_S, paddingTop: 4, paddingBottom: 4 }}>{value || '—'}</td>
    </tr>
  )
}

function SummaryRow({ label, value, highlight, border }) {
  return (
    <tr style={border ? { borderTop: '2px solid #1B2A4A' } : {}}>
      <td style={{
        padding: highlight ? '8px 12px' : '5px 12px',
        fontSize: highlight ? 13 : 12,
        fontWeight: highlight ? 700 : 500,
        color: highlight ? '#1B2A4A' : '#444',
        textAlign: 'right',
        background: highlight ? '#F0F4FF' : 'transparent',
      }}>{label}</td>
      <td style={{
        padding: highlight ? '8px 12px' : '5px 12px',
        fontSize: highlight ? 15 : 12,
        fontWeight: 700,
        color: highlight ? '#1B2A4A' : '#333',
        textAlign: 'right',
        minWidth: 110,
        background: highlight ? '#F0F4FF' : 'transparent',
      }}>
        <span className="num-ltr">{value}</span>
      </td>
    </tr>
  )
}

function buildServiceRows(storageAmount) {
  return [
    { service_code: 'ECM',   quantity: 1, price_per_unit: storageAmount, line_total: storageAmount, is_taxable: 0, is_fixed: 0, is_auto: 0 },
    { service_code: 'AUTOM', quantity: 1, price_per_unit: 1.00, line_total: 1.00, is_taxable: 0, is_fixed: 1, is_auto: 0 },
    { service_code: 'BILLF', quantity: 1, price_per_unit: 1.00, line_total: 1.00, is_taxable: 0, is_fixed: 1, is_auto: 0 },
    { service_code: 'STAMP', quantity: 1, price_per_unit: 2.00, line_total: 2.00, is_taxable: 0, is_fixed: 0, is_auto: 1 },
  ]
}

// billingNumber prop: if provided (batch mode), used directly instead of fetching
// autoExportPath + onAutoExportDone: silent batch PDF export, no toolbar shown
export default function TariffCReceiptPreview({
  agencyData, period, onClose, onSaved,
  billingNumber: billingNumberProp,
  autoExportPath, onAutoExportDone,
  savedReceipt, readOnly = false,
}) {
  const { t } = useTranslation()
  const { session } = useSession()

  const batchMode = !!autoExportPath
  const savedMode = !!savedReceipt

  const [billingNumber, setBillingNumber] = useState(billingNumberProp ?? null)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast]     = useState(null)

  const displayAgencyData = savedMode ? savedReceipt.agencyData : agencyData
  const displayPeriod = savedMode ? savedReceipt.period : period
  const displayBillingNumber = savedMode ? savedReceipt.billingNumber : billingNumber
  const serviceRows = savedMode
    ? (savedReceipt.serviceRows?.length ? savedReceipt.serviceRows : buildServiceRows(savedReceipt.price || 0))
    : buildServiceRows(agencyData.storageAmount)
  const calc = savedMode
    ? {
        userServiceLines: serviceRows.filter(r => !r.is_fixed && !r.is_auto),
        systemServiceLines: serviceRows.filter(r => r.is_fixed || r.is_auto),
        berthingTotal: savedReceipt.berthing_total || 0,
        servicesSubtotal: savedReceipt.services_subtotal || 0,
        taxableSubtotal: savedReceipt.taxable_subtotal || 0,
        rehabFee: savedReceipt.rehab_fee || 0,
        totalTax: savedReceipt.total_tax || 0,
        price: savedReceipt.price || 0,
        fundable: savedReceipt.fundable || 0,
        freshAmount: savedReceipt.fresh_amount || 0,
        finalPrice: savedReceipt.final_price || 0,
        fundableCapped: Number(savedReceipt.fundable || 0) >= 450,
      }
    : calculateReceipt({ berthingRows: [], serviceRows, moduleType: 'GC', vesselType: null })

  // Fetch next billing number only in interactive mode
  useEffect(() => {
    if (savedMode || billingNumberProp != null || batchMode) return
    window.api.tariffCGetNextBillingNumber().then(res => {
      if (res.success) setBillingNumber(res.next)
    })
  }, [savedMode, billingNumberProp, batchMode])

  // Auto-export for batch mode — fires once calc is ready
  useEffect(() => {
    if (!batchMode) return
    let cancelled = false
    async function doExport() {
      await new Promise(r => setTimeout(r, 350))
      if (cancelled) return
      const res = await window.api.receiptExportPDFBatch({ filePath: autoExportPath })
      if (!cancelled && onAutoExportDone) {
        onAutoExportDone(res.success ? null : (res.error || 'Export failed'))
      }
    }
    doExport()
    return () => { cancelled = true }
  }, [autoExportPath, batchMode])

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSave = useCallback(async () => {
    if (saving || saved) return
    setSaving(true)
    const res = await window.api.tariffCSaveReceipt({
      agencyName:        agencyData.agencyName,
      period,
      snapshot: {
        period,
        billingNumber,
        agencyData,
        serviceRows,
      },
      berthing_total:    calc.berthingTotal,
      services_subtotal: calc.servicesSubtotal,
      taxable_subtotal:  calc.taxableSubtotal,
      rehab_fee:         calc.rehabFee,
      total_tax:         calc.totalTax,
      price:             calc.price,
      fundable:          calc.fundable,
      fresh_amount:      calc.freshAmount,
      final_price:       calc.finalPrice,
      generated_by:      session?.username || 'system',
    })
    setSaving(false)
    if (res.success) {
      setBillingNumber(res.billingNumber)
      setSaved(true)
      showToast(t('tc_receipt_saved'), 'success')
      if (onSaved) onSaved()
    } else {
      showToast(res.error, 'error')
    }
  }, [agencyData, period, billingNumber, serviceRows, calc, saving, saved, session, t, onSaved])

  async function handleExportPDF() {
    setExporting(true)
    const safeName = displayAgencyData.agencyName.replace(/[^a-zA-Z0-9-_]/g, '_')
    const filename = `TariffC_${safeName}_${String(displayPeriod || '').replace(/\s+/g, '_')}.pdf`
    const res = await window.api.receiptExportPDF({ defaultFilename: filename })
    setExporting(false)
    if (res && res.success) showToast(t('pdf_exported'), 'success')
    else if (res && !res.canceled) showToast(t('pdf_export_failed'), 'error')
  }

  const dateUntilDisplay = displayAgencyData.dateUntil ? `${displayAgencyData.dateUntil} 23:59` : '—'

  const receiptPage = (
    <div id="receipt-print-area" style={{
      width: 800, background: 'white',
      boxShadow: batchMode ? 'none' : '0 4px 32px rgba(0,0,0,0.18)',
      padding: '44px 52px 52px',
      marginBottom: batchMode ? 0 : 60, flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '3px solid #1B2A4A', paddingBottom: 14, marginBottom: 20,
      }}>
        <img src={portLogo} alt="Port of Beirut" style={{ height: 72, width: 'auto' }} />
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1B2A4A', letterSpacing: '0.04em' }}>
            PORT OF BEIRUT
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
            Gestion et Exploitation du Port du Liban &mdash; إدارة واستثمار مرفأ بيروت
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: '#1B2A4A' }}>
            {t('tc_bill_of_services')}
          </div>
          <div style={{ fontSize: 11, color: '#777', marginTop: 4, direction: 'rtl' }}>
            فاتورة أولية &nbsp;|&nbsp; إعداد: ابراهيم العيتاني
          </div>
        </div>
        <div style={{ width: 80 }} />
      </div>

      {/* Bill Info Grid — Tariff C header */}
      <div style={{ marginBottom: 22, border: '1px solid #E0E6F0', borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <InfoRow label={t('agency_name')}           value={displayAgencyData.agencyName} />
            <InfoRow label={t('period_label')}          value={displayPeriod} />
            <InfoRow label={t('tc_box_number')}         value={String(displayAgencyData.box ?? '')} />
            <InfoRow label={t('tc_free_teus_per_day')}  value={String(displayAgencyData.freeTEUsPerDay ?? '')} />
            <InfoRow label={t('tc_monthly_free')}       value={String(displayAgencyData.monthlyFreeContainers ?? '')} />
            <InfoRow label={t('tc_total_teus')}         value={String(displayAgencyData.totalActualTEUs ?? '')} />
            <InfoRow label={t('tc_date_until')}         value={dateUntilDisplay} />
            <InfoRow label={t('tc_billing_number')}     value={displayBillingNumber != null ? String(displayBillingNumber) : '—'} />
          </tbody>
        </table>
      </div>

      {/* Section: Services */}
      <div style={{
        fontSize: 12, fontWeight: 700, background: '#1B2A4A', color: 'white',
        padding: '6px 10px', marginBottom: 0, letterSpacing: '0.03em',
      }}>
        {t('services_section')}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <thead>
          <tr>
            <th style={{ ...T_HEAD, textAlign: 'left' }}>{t('service_code')}</th>
            <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('quantity')}</th>
            <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('price_per_unit')}</th>
            <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('total_fee')}</th>
          </tr>
        </thead>
        <tbody>
          {calc.userServiceLines.map((row, i) => (
            <tr key={i}>
              <td style={T_CELL}><strong>{row.service_code}</strong></td>
              <td style={{ ...T_CELL, textAlign: 'right' }}><span className="num-ltr">{row.quantity}</span></td>
              <td style={{ ...T_CELL, textAlign: 'right' }}><span className="num-ltr">{fmt(row.price_per_unit)}</span></td>
              <td style={{ ...T_CELL, textAlign: 'right', fontWeight: 600 }}><span className="num-ltr">{fmt(row.line_total)}</span></td>
            </tr>
          ))}
          {calc.systemServiceLines.length > 0 && (
            <tr>
              <td colSpan={4} style={{
                padding: '5px 10px', background: '#F4F6FB',
                fontSize: 10, color: '#6C757D', fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                borderTop: '1px dashed #C8D0E0',
              }}>
                {t('system_lines')}
              </td>
            </tr>
          )}
          {calc.systemServiceLines.map((row, i) => (
            <tr key={i} style={{ opacity: 0.75 }}>
              <td style={T_CELL}><strong>{row.service_code}</strong></td>
              <td style={{ ...T_CELL, textAlign: 'right' }}><span className="num-ltr">{row.quantity}</span></td>
              <td style={{ ...T_CELL, textAlign: 'right' }}><span className="num-ltr">{fmt(row.price_per_unit)}</span></td>
              <td style={{ ...T_CELL, textAlign: 'right', fontWeight: 600 }}><span className="num-ltr">{fmt(row.line_total)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tax Block + Summary */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, borderTop: '2px solid #1B2A4A', paddingTop: 14 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 240 }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ padding: '4px 12px 8px', fontSize: 11, fontWeight: 700, color: '#1B2A4A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {t('tax_block_title')}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px', fontSize: 12, color: '#444', textAlign: 'right' }}>{t('taxable_stamp')}</td>
              <td style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, textAlign: 'right', minWidth: 90 }}>
                <span className="num-ltr">{fmt(calc.taxableSubtotal)}</span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px', fontSize: 12, color: '#444', textAlign: 'right', borderTop: '1px solid #E0E6F0' }}>{t('total_tax')}</td>
              <td style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, textAlign: 'right', borderTop: '1px solid #E0E6F0' }}>
                <span className="num-ltr">{fmt(calc.totalTax)}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ borderCollapse: 'collapse', minWidth: 260, border: '1px solid #D0D8EC', borderRadius: 4 }}>
          <tbody>
            <SummaryRow label={t('receipt_price')} value={fmt(calc.price)} />
            <SummaryRow
              label={`${t('fundable')} (3.5%${calc.fundableCapped ? ` — ${t('capped')} $450` : ''})`}
              value={fmt(calc.fundable)}
            />
            <SummaryRow label={t('fresh_amount')} value={fmt(calc.freshAmount)} border />
            <SummaryRow label={t('final_price')} value={fmtInt(calc.finalPrice)} highlight border />
          </tbody>
        </table>
      </div>

      {/* Generated note */}
      <div style={{ marginTop: 28, paddingTop: 12, borderTop: '1px dashed #D0D8EC', fontSize: 10, color: '#999', textAlign: 'right' }}>
        {t('generated_at')}: {savedMode ? (savedReceipt.generated_at || '—') : new Date().toLocaleString('en-US', { timeZone: 'Asia/Beirut' })} &nbsp;|&nbsp; {t('generated_by_label')}: {savedMode ? (savedReceipt.generated_by || '—') : (session?.full_name || session?.username || '—')}
      </div>
    </div>
  )

  // Batch mode: render receipt directly (no overlay chrome), printToPDF captures it
  if (batchMode) {
    return createPortal(
      <div id="receipt-overlay" style={{
        position: 'fixed', inset: 0, background: 'white',
        overflowY: 'auto', zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {receiptPage}
      </div>,
      document.body
    )
  }

  // Interactive mode: full overlay with toolbar
  return createPortal(
    <div id="receipt-overlay" style={{
      position: 'fixed', inset: 0, background: '#D8DDE8',
      overflowY: 'auto', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* Toast */}
      {toast && (
        <div className="no-print" style={{
          position: 'fixed', top: 16, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? '#27ae60' : '#c0392b',
          color: 'white', borderRadius: 8, padding: '10px 18px',
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 10, width: '100%', maxWidth: 860,
        background: '#D8DDE8', padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #94a3b8', background: 'white', color: '#1e293b', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          ← {t('close')}
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #94a3b8', background: 'white', color: '#1e293b', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            🖨 {t('print')}
          </button>
          <button onClick={handleExportPDF} disabled={exporting} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #94a3b8', background: 'white', color: exporting ? '#94a3b8' : '#1e293b', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500 }}>
            ⬇ {exporting ? '...' : t('export_pdf')}
          </button>
          {!readOnly && !savedMode && (
          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              padding: '8px 22px', borderRadius: 6, border: 'none',
              background: saved ? '#27ae60' : (saving ? 'rgba(255,255,255,0.1)' : 'white'),
              color: saved ? 'white' : '#1B2A4A',
              cursor: (saving || saved) ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 700,
            }}
          >
            {saved ? `✓ ${t('receipt_saved_short')}` : (saving ? '...' : t('save_receipt'))}
          </button>
          )}
        </div>
      </div>

      {receiptPage}
    </div>,
    document.body
  )
}
