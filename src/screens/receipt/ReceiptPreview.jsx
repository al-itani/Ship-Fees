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
function fmtDate(s) {
  if (!s) return '—'
  return s.slice(0, 16).replace('T', ' ')
}

const T_CELL  = { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #E8ECF4', verticalAlign: 'middle' }
const T_HEAD  = { padding: '7px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.04em', color: '#1B2A4A', background: '#F0F4FF',
                  borderBottom: '2px solid #D0D8EC' }
const LABEL_S = { fontSize: 11, color: '#6C757D', fontWeight: 500 }
const VALUE_S = { fontSize: 12, fontWeight: 600, color: '#1A1A2E' }

function InfoRow({ label, value }) {
  return (
    <tr>
      <td style={{ ...T_CELL, ...LABEL_S, paddingTop: 4, paddingBottom: 4, whiteSpace: 'nowrap', width: 130 }}>{label}</td>
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

export default function ReceiptPreview({ voyageNumber, readOnly, onClose }) {
  const { t } = useTranslation()
  const { session } = useSession()

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [rawData, setRawData]   = useState(null)
  const [calc, setCalc]         = useState(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast]       = useState(null)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Load data
  useEffect(() => {
    window.api.receiptGetData(voyageNumber).then(res => {
      setLoading(false)
      if (!res.success) { setError(res.error); return }
      const d = res.data
      setRawData(d)
      setCalc(calculateReceipt(d))
      if (d.existingReceipt && !readOnly) setShowRegenConfirm(true)
    })
  }, [voyageNumber, readOnly])

  // Enter/Escape for regen confirm
  useEffect(() => {
    if (!showRegenConfirm) return
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); setShowRegenConfirm(false) }
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRegenConfirm, onClose])

  const handleSave = useCallback(async () => {
    if (!rawData || !calc || saving) return
    setSaving(true)
    const res = await window.api.receiptSave({
      voyage_id:         rawData.voyageId,
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
      generated_by:      session?.username || 'system',
    })
    setSaving(false)
    if (res.success) { setSaved(true); showToast(t('receipt_saved'), 'success') }
    else showToast(res.error, 'error')
  }, [rawData, calc, saving, voyageNumber, session, t])

  async function handlePrint() {
    window.print()
  }

  async function handleExportPDF() {
    if (!rawData) return
    setExporting(true)
    const vn = voyageNumber.replace(/[^a-zA-Z0-9-_]/g, '_')
    const vessel = (rawData.header?.vessel_name || 'Vessel').replace(/[^a-zA-Z0-9-_]/g, '_')
    const filename = `Receipt_${vn}_${vessel}.pdf`
    const res = await window.api.receiptExportPDF({ defaultFilename: filename })
    setExporting(false)
    if (res && res.success) showToast(t('pdf_exported'), 'success')
    else if (res && !res.canceled) showToast(t('pdf_export_failed'), 'error')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const content = (
    <div
      id="receipt-overlay"
      style={{
        position: 'fixed', inset: 0,
        background: '#D8DDE8', overflowY: 'auto', zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
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
        position: 'sticky', top: 0, zIndex: 10,
        width: '100%', maxWidth: 860,
        background: '#D8DDE8',
        padding: '14px 20px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            padding: '8px 18px', borderRadius: 6,
            border: '1px solid #94a3b8',
            background: 'white', color: '#1e293b',
            cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}
        >
          ← {t('close')}
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handlePrint}
            style={{
              padding: '8px 18px', borderRadius: 6, border: '1px solid #94a3b8',
              background: 'white', color: '#1e293b',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}
          >
            🖨 {t('print')}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting || loading || !!error}
            style={{
              padding: '8px 18px', borderRadius: 6, border: '1px solid #94a3b8',
              background: 'white', color: exporting ? '#94a3b8' : '#1e293b',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 500,
            }}
          >
            ⬇ {exporting ? '...' : t('export_pdf')}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving || saved || loading || !!error}
              style={{
                padding: '8px 22px', borderRadius: 6, border: 'none',
                background: saved ? '#27ae60' : (saving || loading || !!error ? 'rgba(255,255,255,0.1)' : 'white'),
                color: saved ? 'white' : '#1B2A4A',
                cursor: (saving || saved || loading || !!error) ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {saved ? `✓ ${t('receipt_saved_short')}` : (saving ? '...' : t('save_receipt'))}
            </button>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div style={{ color: 'white', fontSize: 15, marginTop: 60 }}>
          {t('loading')}...
        </div>
      )}

      {error && !loading && (
        <div style={{
          background: 'white', borderRadius: 8, padding: '28px 40px',
          marginTop: 40, color: '#c0392b', fontSize: 14, textAlign: 'center',
          maxWidth: 480,
        }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{t('receipt_error')}</div>
          <div>{t(error) || error}</div>
        </div>
      )}

      {/* Regenerate notice */}
      {showRegenConfirm && !loading && !error && (
        <div className="no-print" style={{
          width: '100%', maxWidth: 860, padding: '0 20px',
          marginBottom: 8,
        }}>
          <div style={{
            background: '#FFF8E1', border: '1px solid #FFD54F',
            borderRadius: 6, padding: '10px 16px', fontSize: 13,
            color: '#7A5200', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>⚠ {t('receipt_already_exists')}</span>
            <button
              onClick={() => setShowRegenConfirm(false)}
              style={{
                border: 'none', background: 'transparent',
                color: '#7A5200', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              {t('ok')}
            </button>
          </div>
        </div>
      )}

      {/* ── Receipt Page ─────────────────────────────────────────────────────── */}
      {!loading && !error && rawData && calc && (
        <div id="receipt-print-area" style={{
          width: 800, background: 'white',
          boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
          padding: '44px 52px 52px',
          marginBottom: 60, flexShrink: 0,
        }}>
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '3px solid #1B2A4A',
            paddingBottom: 14, marginBottom: 20,
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
                {t('bill_of_services')}
              </div>
              <div style={{ fontSize: 11, color: '#777', marginTop: 4, direction: 'rtl' }}>
                فاتورة أولية &nbsp;|&nbsp; إعداد: ابراهيم العيتاني
              </div>
            </div>
            <div style={{ width: 80 }} />
          </div>

          {/* ── Bill Info Grid ───────────────────────────────────────────────── */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px',
            marginBottom: 22, border: '1px solid #E0E6F0', borderRadius: 4, overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <InfoRow label={`${t('voyage_number')} / ${t('bill_number')}`} value={voyageNumber} />
                <InfoRow label={t('vessel_name')} value={rawData.header.vessel_name} />
                <InfoRow label={t('vessel_type')} value={rawData.header.vessel_type} />
                <InfoRow label={t('flag')} value={rawData.header.flag} />
              </tbody>
            </table>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <InfoRow label={t('shipping_agent')} value={rawData.header.shipping_agent} />
                <InfoRow label={t('position')} value={rawData.header.position} />
                <InfoRow label={t('ata')} value={fmtDate(rawData.header.ata)} />
                <InfoRow label={t('atd')} value={fmtDate(rawData.header.atd)} />
                <InfoRow label={t('loa_m')} value={rawData.header.loa != null ? String(rawData.header.loa) + ' m' : '—'} />
              </tbody>
            </table>
          </div>

          {/* ── Section 1: Berthing Fees ─────────────────────────────────────── */}
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#1B2A4A',
            background: '#1B2A4A', color: 'white',
            padding: '6px 10px', marginBottom: 0, letterSpacing: '0.03em',
          }}>
            {t('berthing_fees_section')}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
            <thead>
              <tr>
                <th style={{ ...T_HEAD, textAlign: 'left' }}>{t('voyage_number')}</th>
                <th style={{ ...T_HEAD, textAlign: 'left' }}>{t('service_code')}</th>
                <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('loa_abbr')}</th>
                <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('days')}</th>
                <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('total_fee')}</th>
              </tr>
            </thead>
            <tbody>
              {rawData.berthingRows.map((row, i) => (
                <tr key={row.id || i}>
                  <td style={T_CELL}>{voyageNumber}</td>
                  <td style={T_CELL}>{row.position}</td>
                  <td style={{ ...T_CELL, textAlign: 'right' }}>
                    <span className="num-ltr">{row.loa != null ? Number(row.loa).toFixed(2) : '—'}</span>
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right' }}>
                    <span className="num-ltr">{row.days}</span>
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right', fontWeight: 600 }}>
                    <span className="num-ltr">{fmt(row.final_fee)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{
            display: 'flex', justifyContent: 'flex-end',
            padding: '6px 10px', borderTop: '2px solid #1B2A4A',
            marginBottom: 22,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1B2A4A' }}>
              {t('berthing_total')}:{' '}
              <span className="num-ltr" style={{ fontSize: 14 }}>{fmt(calc.berthingTotal)}</span>
            </span>
          </div>

          {/* ── Section 2: Services ──────────────────────────────────────────── */}
          <div style={{
            fontSize: 12, fontWeight: 700,
            background: '#1B2A4A', color: 'white',
            padding: '6px 10px', marginBottom: 0, letterSpacing: '0.03em',
          }}>
            {t('services_section')}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
            <thead>
              <tr>
                <th style={{ ...T_HEAD, textAlign: 'left' }}>{t('voyage_number')}</th>
                <th style={{ ...T_HEAD, textAlign: 'left' }}>{t('service_code')}</th>
                <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('quantity')}</th>
                <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('price_per_unit')}</th>
                <th style={{ ...T_HEAD, textAlign: 'right' }}>{t('total_fee')}</th>
              </tr>
            </thead>
            <tbody>
              {/* User service lines */}
              {calc.userServiceLines.map((row, i) => (
                <tr key={row.id || i}>
                  <td style={T_CELL}>{voyageNumber}</td>
                  <td style={T_CELL}>
                    <strong>{row.service_code}</strong>
                    {row.description && row.description !== row.service_code
                      ? <span style={{ color: '#888', fontWeight: 400 }}> {row.description}</span>
                      : null}
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right' }}>
                    <span className="num-ltr">{row.quantity}</span>
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right' }}>
                    <span className="num-ltr">{fmt(row.price_per_unit)}</span>
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right', fontWeight: 600 }}>
                    <span className="num-ltr">{fmt(row.line_total)}</span>
                  </td>
                </tr>
              ))}

              {/* System lines divider */}
              {calc.systemServiceLines.length > 0 && (
                <tr>
                  <td colSpan={5} style={{
                    padding: '5px 10px', background: '#F4F6FB',
                    fontSize: 10, color: '#6C757D',
                    fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderTop: '1px dashed #C8D0E0',
                  }}>
                    {t('system_lines')}
                  </td>
                </tr>
              )}

              {/* System lines */}
              {calc.systemServiceLines.map((row, i) => (
                <tr key={row.id || i} style={{ opacity: 0.75 }}>
                  <td style={T_CELL}>{voyageNumber}</td>
                  <td style={T_CELL}>
                    <strong>{row.service_code}</strong>
                    {row.description && row.description !== row.service_code
                      ? <span style={{ color: '#888', fontWeight: 400 }}> {row.description}</span>
                      : null}
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right' }}>
                    <span className="num-ltr">{row.quantity}</span>
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right' }}>
                    <span className="num-ltr">{fmt(row.price_per_unit)}</span>
                  </td>
                  <td style={{ ...T_CELL, textAlign: 'right', fontWeight: 600 }}>
                    <span className="num-ltr">{fmt(row.line_total)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Tax Block + Summary ──────────────────────────────────────────── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 20,
            borderTop: '2px solid #1B2A4A', paddingTop: 14,
          }}>
            {/* Tax block — GC only */}
            {calc.isGC && (
              <table style={{ borderCollapse: 'collapse', minWidth: 240 }}>
                <tbody>
                  <tr>
                    <td colSpan={2} style={{
                      padding: '4px 12px 8px', fontSize: 11, fontWeight: 700,
                      color: '#1B2A4A', letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>
                      {t('tax_block_title')}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 12px', fontSize: 12, color: '#444', textAlign: 'right' }}>
                      {t('taxable_stamp')}
                    </td>
                    <td style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, textAlign: 'right', minWidth: 90 }}>
                      <span className="num-ltr">{fmt(calc.taxableSubtotal)}</span>
                    </td>
                  </tr>
                  {calc.rehabFee > 0 && (
                    <tr>
                      <td style={{ padding: '4px 12px', fontSize: 12, color: '#444', textAlign: 'right' }}>
                        {t('rehabilitation_fee')}
                      </td>
                      <td style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                        <span className="num-ltr">{fmt(calc.rehabFee)}</span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '4px 12px 4px', fontSize: 12, color: '#444', textAlign: 'right', borderTop: '1px solid #E0E6F0' }}>
                      {t('total_tax')}
                    </td>
                    <td style={{ padding: '4px 12px 4px', fontSize: 12, fontWeight: 700, textAlign: 'right', borderTop: '1px solid #E0E6F0' }}>
                      <span className="num-ltr">{fmt(calc.totalTax)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Summary block */}
            <table style={{
              borderCollapse: 'collapse', minWidth: 260,
              border: '1px solid #D0D8EC', borderRadius: 4,
            }}>
              <tbody>
                <SummaryRow label={t('receipt_price')} value={fmt(calc.price)} />
                <SummaryRow
                  label={`${t('fundable')} (3.5%${calc.fundableCapped ? ` — ${t('capped')} $450` : ''})`}
                  value={fmt(calc.fundable)}
                />
                {!calc.isGC && (
                  <SummaryRow label={t('container_tax')} value="$0.22" />
                )}
                <SummaryRow label={t('fresh_amount')} value={fmt(calc.freshAmount)} border />
                <SummaryRow label={t('final_price')} value={fmtInt(calc.finalPrice)} highlight border />
              </tbody>
            </table>
          </div>

          {/* Generated note */}
          <div style={{
            marginTop: 28, paddingTop: 12,
            borderTop: '1px dashed #D0D8EC',
            fontSize: 10, color: '#999', textAlign: 'right',
          }}>
            {t('generated_by_label')}: {session?.full_name || '—'} &nbsp;|&nbsp; {t('generated_at')}: {new Date().toLocaleString('en-US')}
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
