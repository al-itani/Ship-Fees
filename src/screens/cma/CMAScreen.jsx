import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import portLogo from '../../assets/port-logo.jpg'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const now = new Date()

function fmt2(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TH = {
  padding: '8px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#1B2A4A', background: '#F0F4FF',
  borderBottom: '2px solid #D0D8EC', whiteSpace: 'nowrap',
}
const TD  = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #EEF0F6', whiteSpace: 'nowrap' }
const TDR = { ...TD, textAlign: 'right' }
const TDF = { ...TDR, fontWeight: 700, background: '#F8FAFF', borderTop: '2px solid #1B2A4A', borderBottom: 'none' }

export default function CMAScreen() {
  const { t } = useTranslation()

  const [tab, setTab] = useState('normal')

  // Shared pickers
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  // Toast
  const [toast, setToast] = useState(null)
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Normal Receipt state ──────────────────────────────────────────────────
  const [detailed, setDetailed]   = useState(false)
  const [report, setReport]       = useState(null)
  const [trsData, setTrsData]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [hideZeros, setHideZeros] = useState(true)
  const [currency, setCurrency]   = useState('both')
  const [showPicker, setShowPicker]   = useState(false)
  const [exportAgent, setExportAgent] = useState('')
  const [exporting, setExporting]     = useState(false)
  const [trsPrinting, setTrsPrinting] = useState(false)

  const LOCAL_LBP = 479260
  const TRANS_LBP = 311519

  async function handleGenerateNormal() {
    setLoading(true)
    setReport(null)
    setTrsData(null)
    if (detailed) {
      const res = await window.api.cmaNormalTrsReport(year, month)
      setLoading(false)
      if (!res.success) { showToast(res.error || t('cma_error_load'), 'error'); return }
      setTrsData(res.data)
    } else {
      const res = await window.api.cmaNormalReport(year, month)
      setLoading(false)
      if (!res.success) { showToast(res.error || t('cma_error_load'), 'error'); return }
      setReport(res.data)
      if (res.data.length > 0) setExportAgent('__ALL__')
    }
  }

  async function handleExportNormal() {
    if (!exportAgent) return
    setExporting(true)
    const res = await window.api.cmaExportNormalExcel(year, month, exportAgent)
    setExporting(false)
    setShowPicker(false)
    if (res.canceled) return
    if (res.success) showToast(t('cma_export_success'))
    else showToast(res.error || t('cma_export_failed'), 'error')
  }

  async function handlePrintTRS() {
    setTrsPrinting(true)
    await new Promise(r => setTimeout(r, 80))
    window.print()
    setTrsPrinting(false)
  }

  const visibleRows = report
    ? (hideZeros ? report.filter(r => r.total > 0 || r.local_20 > 0 || r.trans_20 > 0) : report)
    : []

  const totals = visibleRows.reduce((acc, r) => ({
    local_20:   acc.local_20   + r.local_20,
    local_40:   acc.local_40   + r.local_40,
    trans_20:   acc.trans_20   + r.trans_20,
    trans_40:   acc.trans_40   + r.trans_40,
    local_teus: acc.local_teus + r.local_teus,
    trans_teus: acc.trans_teus + r.trans_teus,
    local_fee:  acc.local_fee  + r.local_fee,
    trans_fee:  acc.trans_fee  + r.trans_fee,
    total:      acc.total      + r.total,
  }), { local_20:0, local_40:0, trans_20:0, trans_40:0, local_teus:0, trans_teus:0, local_fee:0, trans_fee:0, total:0 })

  const visibleTrsRows = trsData
    ? (hideZeros ? trsData.filter(r => r.local_20 > 0 || r.local_40 > 0 || r.trans_20 > 0 || r.trans_40 > 0) : trsData)
    : []

  const trsTotals = visibleTrsRows.reduce((acc, r) => ({
    local_20:   acc.local_20   + r.local_20,
    local_40:   acc.local_40   + r.local_40,
    trans_20:   acc.trans_20   + r.trans_20,
    trans_40:   acc.trans_40   + r.trans_40,
    local_teus: acc.local_teus + r.local_teus,
    trans_teus: acc.trans_teus + r.trans_teus,
    total:      acc.total      + r.total,
    total_lbp:  acc.total_lbp  + r.local_lbp + r.trans_lbp,
  }), { local_20:0, local_40:0, trans_20:0, trans_40:0, local_teus:0, trans_teus:0, total:0, total_lbp:0 })

  // ── FRP Receipt state ─────────────────────────────────────────────────────
  const [frpReport, setFrpReport]     = useState(null)
  const [frpLoading, setFrpLoading]   = useState(false)
  const [frpPrinting, setFrpPrinting] = useState(false)
  const [frpHideZeros, setFrpHideZeros] = useState(true)
  const [frpShowPicker, setFrpShowPicker]   = useState(false)
  const [frpExportAgent, setFrpExportAgent] = useState('')
  const [frpExporting, setFrpExporting]     = useState(false)

  async function handleGenerateFRP() {
    setFrpLoading(true)
    setFrpReport(null)
    const res = await window.api.cmaFrpReport(year, month)
    setFrpLoading(false)
    if (!res.success) { showToast(res.error || t('cma_error_load'), 'error'); return }
    setFrpReport(res.data)
    if (res.data.length > 0) setFrpExportAgent('__ALL__')
  }

  async function handleExportFRP() {
    if (!frpExportAgent) return
    setFrpExporting(true)
    const res = await window.api.cmaExportFrpExcel(year, month, frpExportAgent)
    setFrpExporting(false)
    setFrpShowPicker(false)
    if (res.canceled) return
    if (res.success) showToast(t('cma_export_success'))
    else showToast(res.error || t('cma_export_failed'), 'error')
  }

  async function handlePrintFRP() {
    setFrpPrinting(true)
    await new Promise(r => setTimeout(r, 80))
    window.print()
    setFrpPrinting(false)
  }

  const visibleFrpRows = frpReport
    ? (frpHideZeros ? frpReport.filter(r => r.frp_teus > 0) : frpReport)
    : []

  const frpTotals = visibleFrpRows.reduce((acc, r) => ({
    frp_20:   acc.frp_20   + r.frp_20,
    frp_40:   acc.frp_40   + r.frp_40,
    frp_teus: acc.frp_teus + r.frp_teus,
    fee:      acc.fee      + r.fee,
  }), { frp_20:0, frp_40:0, frp_teus:0, fee:0 })

  // ── GC state ─────────────────────────────────────────────────────────────
  const [gcReport, setGcReport]     = useState(null)
  const [gcLoading, setGcLoading]   = useState(false)
  const [gcPrinting, setGcPrinting] = useState(false)

  async function handleGenerateGC() {
    setGcLoading(true)
    setGcReport(null)
    const res = await window.api.cmaGetGCReport(year, month)
    setGcLoading(false)
    if (!res.success) { showToast(res.error || t('cma_error_load'), 'error'); return }
    setGcReport(res.data)
  }

  async function handlePrintGC() {
    setGcPrinting(true)
    await new Promise(r => setTimeout(r, 80))
    window.print()
    setGcPrinting(false)
  }

  const gcGrandTotal = gcReport ? +gcReport.reduce((s, v) => s + v.subtotal, 0).toFixed(2) : 0

  function handleGenerate() {
    if (tab === 'normal') handleGenerateNormal()
    else if (tab === 'frp') handleGenerateFRP()
    else handleGenerateGC()
  }

  const isLoading = loading || frpLoading || gcLoading

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app-screen" style={{ padding: 28, maxWidth: 1100 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? '#27ae60' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px',
          fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Normal TRS print overlay */}
      {trsPrinting && trsData && (
        <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto', padding: '40px 60px' }}>
          <div style={{ maxWidth: 920, margin: '0 auto', fontFamily: 'serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, borderBottom: '2px solid #1B2A4A', paddingBottom: 16 }}>
              <img src={portLogo} alt="Port of Beirut" style={{ height: 64, width: 'auto' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1B2A4A' }}>Port of Beirut — مرفأ بيروت</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{t('cma_detailed_report')} — {MONTHS[month - 1]} {year}</div>
              </div>
            </div>
            <div style={{ display: 'flex', border: '1px solid #D0D8EC', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ flex: 1, padding: '14px 20px', textAlign: 'center', background: '#F8FAFF' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Total TEUs</div>
                <div className="num-ltr" style={{ fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>{(trsTotals.local_teus + trsTotals.trans_teus).toLocaleString('en-US')}</div>
              </div>
              <div style={{ flex: 1, padding: '14px 20px', textAlign: 'center', background: '#F8FAFF', borderInlineStart: '1px solid #D0D8EC' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('cma_total')}</div>
                <div className="num-ltr" style={{ fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>${fmt2(trsTotals.total)}</div>
              </div>
              <div style={{ flex: 1, padding: '14px 20px', textAlign: 'center', background: '#F8FAFF', borderInlineStart: '1px solid #D0D8EC' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('cma_total_lbp')}</div>
                <div className="num-ltr" style={{ fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>{trsTotals.total_lbp.toLocaleString('en-US')}</div>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', fontSize: 10 }}>{t('shipping_agent')}</th>
                  <th style={{ ...TH, textAlign: 'left', fontSize: 10 }}>{t('voyage_number')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('cma_20ft_local')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('cma_40ft_local')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('cma_20ft_trans')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('cma_40ft_trans')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10, borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_local_teus')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('cma_trans_teus')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10, borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_total')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('cma_total_lbp')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTrsRows.map(r => (
                  <tr key={r.voyage_number}>
                    <td style={{ ...TD, fontSize: 11 }}>{r.agent}</td>
                    <td style={{ ...TD, fontSize: 11 }}><span className="num-ltr">{r.voyage_number}</span></td>
                    <td style={{ ...TDR, fontSize: 11 }}><span className="num-ltr">{r.local_20}</span></td>
                    <td style={{ ...TDR, fontSize: 11 }}><span className="num-ltr">{r.local_40}</span></td>
                    <td style={{ ...TDR, fontSize: 11 }}><span className="num-ltr">{r.trans_20}</span></td>
                    <td style={{ ...TDR, fontSize: 11 }}><span className="num-ltr">{r.trans_40}</span></td>
                    <td style={{ ...TDR, fontSize: 11, borderInlineStart: '1px solid #EEF0F6', fontWeight: 600 }}><span className="num-ltr">{r.local_teus}</span></td>
                    <td style={{ ...TDR, fontSize: 11, fontWeight: 600 }}><span className="num-ltr">{r.trans_teus}</span></td>
                    <td style={{ ...TDR, fontSize: 11, borderInlineStart: '1px solid #EEF0F6', fontWeight: 700, color: '#1B2A4A' }}><span className="num-ltr">${fmt2(r.total)}</span></td>
                    <td style={{ ...TDR, fontSize: 11, fontWeight: 700, color: '#1B2A4A' }}><span className="num-ltr">{(r.local_lbp + r.trans_lbp).toLocaleString('en-US')}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...TDF, textAlign: 'left', fontSize: 10, textTransform: 'uppercase' }} colSpan={2}>{t('total_records')}</td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{trsTotals.local_20}</span></td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{trsTotals.local_40}</span></td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{trsTotals.trans_20}</span></td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{trsTotals.trans_40}</span></td>
                  <td style={{ ...TDF, fontSize: 11, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">{trsTotals.local_teus}</span></td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{trsTotals.trans_teus}</span></td>
                  <td style={{ ...TDF, fontSize: 12, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">${fmt2(trsTotals.total)}</span></td>
                  <td style={{ ...TDF, fontSize: 12 }}><span className="num-ltr">{trsTotals.total_lbp.toLocaleString('en-US')}</span></td>
                </tr>
              </tfoot>
            </table>
            <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #E0E0E0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <img src={portLogo} alt="Port of Beirut" style={{ height: 28, width: 'auto', opacity: 0.5 }} />
              <span style={{ fontSize: 9, color: '#aaa', fontStyle: 'italic' }}>Prepared by: Ibrahim Al-Itani</span>
            </div>
          </div>
        </div>
      )}

      {/* FRP print overlay */}
      {frpPrinting && frpReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto', padding: '40px 60px' }}>
          <div style={{ maxWidth: 740, margin: '0 auto', fontFamily: 'serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, borderBottom: '2px solid #1B2A4A', paddingBottom: 16 }}>
              <img src={portLogo} alt="Port of Beirut" style={{ height: 64, width: 'auto' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1B2A4A' }}>Port of Beirut — مرفأ بيروت</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{t('frp_receipt_tab')} — {MONTHS[month - 1]} {year}</div>
              </div>
            </div>
            <div style={{ display: 'flex', border: '1px solid #D0D8EC', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ flex: 1, padding: '14px 20px', textAlign: 'center', background: '#F8FAFF' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Total TEUs</div>
                <div className="num-ltr" style={{ fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>{frpTotals.frp_teus.toLocaleString('en-US')}</div>
              </div>
              <div style={{ flex: 1, padding: '14px 20px', textAlign: 'center', background: '#F8FAFF', borderInlineStart: '1px solid #D0D8EC' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('cma_total')}</div>
                <div className="num-ltr" style={{ fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>${fmt2(frpTotals.fee)}</div>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', fontSize: 10 }}>{t('shipping_agent')}</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>20ft</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>40ft</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>TEUs</th>
                  <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('cma_total')} ($)</th>
                </tr>
              </thead>
              <tbody>
                {visibleFrpRows.map(r => (
                  <tr key={r.agent}>
                    <td style={{ ...TD, fontSize: 11 }}>{r.agent}</td>
                    <td style={{ ...TDR, fontSize: 11 }}><span className="num-ltr">{r.frp_20}</span></td>
                    <td style={{ ...TDR, fontSize: 11 }}><span className="num-ltr">{r.frp_40}</span></td>
                    <td style={{ ...TDR, fontSize: 11, fontWeight: 600 }}><span className="num-ltr">{r.frp_teus}</span></td>
                    <td style={{ ...TDR, fontSize: 11, fontWeight: 700, color: '#1B2A4A' }}><span className="num-ltr">${fmt2(r.fee)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...TDF, textAlign: 'left', fontSize: 10, textTransform: 'uppercase' }}>{t('total_records')}</td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{frpTotals.frp_20}</span></td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{frpTotals.frp_40}</span></td>
                  <td style={{ ...TDF, fontSize: 11 }}><span className="num-ltr">{frpTotals.frp_teus}</span></td>
                  <td style={{ ...TDF, fontSize: 12 }}><span className="num-ltr">${fmt2(frpTotals.fee)}</span></td>
                </tr>
              </tfoot>
            </table>
            <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #E0E0E0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <img src={portLogo} alt="Port of Beirut" style={{ height: 28, width: 'auto', opacity: 0.5 }} />
              <span style={{ fontSize: 9, color: '#aaa', fontStyle: 'italic' }}>Prepared by: Ibrahim Al-Itani</span>
            </div>
          </div>
        </div>
      )}

      {/* GC PDF print overlay */}
      {gcPrinting && gcReport && (
        <div style={{
          position: 'fixed', inset: 0, background: 'white', zIndex: 9999,
          overflowY: 'auto', padding: '40px 60px',
        }}>
          <div style={{ maxWidth: 740, margin: '0 auto', fontFamily: 'serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, borderBottom: '2px solid #1B2A4A', paddingBottom: 16 }}>
              <img src={portLogo} alt="Port of Beirut" style={{ height: 64, width: 'auto' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1B2A4A' }}>Port of Beirut — مرفأ بيروت</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>CMA {t('gc_receipt_tab')}</div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{MONTHS[month - 1]} {year}</div>
              </div>
            </div>
            {gcReport.map(voyage => (
              <div key={voyage.voyage_number} style={{ marginBottom: 24, pageBreakInside: 'avoid' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#F0F4FF', padding: '7px 12px', borderRadius: 4,
                  fontWeight: 700, fontSize: 13, color: '#1B2A4A', marginBottom: 4,
                }}>
                  <span>{t('voyage_number')}: <span className="num-ltr">{voyage.voyage_number}</span>{voyage.vessel_name ? ` — ${voyage.vessel_name}` : ''}</span>
                  <span>{t('shipping_agent')}: {voyage.shipping_agent}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, textAlign: 'left', fontSize: 10 }}>{t('gc_receipt_code')}</th>
                      <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('gc_receipt_original_value')}</th>
                      <th style={{ ...TH, textAlign: 'right', fontSize: 10 }}>{t('gc_receipt_billable_35')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voyage.lines.map(line => (
                      <tr key={line.service_code}>
                        <td style={{ ...TD, fontSize: 12 }}>{line.service_code}</td>
                        <td style={{ ...TDR, fontSize: 12 }}><span className="num-ltr">${fmt2(line.original)}</span></td>
                        <td style={{ ...TDR, fontSize: 12 }}><span className="num-ltr">${fmt2(line.billable)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...TDF, textAlign: 'left', fontSize: 11 }} colSpan={2}>{t('gc_voyage_subtotal')}</td>
                      <td style={{ ...TDF, fontSize: 12 }}><span className="num-ltr">${fmt2(voyage.subtotal)}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
            <div style={{
              marginTop: 24, borderTop: '3px solid #1B2A4A', paddingTop: 12,
              display: 'flex', justifyContent: 'flex-end', gap: 24,
              fontSize: 15, fontWeight: 700, color: '#1B2A4A',
            }}>
              <span>{t('gc_grand_total')}</span>
              <span className="num-ltr">${fmt2(gcGrandTotal)}</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: '#888', textAlign: 'center' }}>
              {t('gc_receipt_note')}
            </div>
          </div>
        </div>
      )}

      {/* Normal export picker modal */}
      {showPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, padding: '32px 40px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', minWidth: 360,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: '#1B2A4A' }}>
              {t('cma_select_agent_export')}
            </div>
            <select
              value={exportAgent}
              onChange={e => setExportAgent(e.target.value)}
              style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 14, marginBottom: 20 }}
            >
              <option value="__ALL__">— {t('cma_all_agents')} —</option>
              {report?.map(r => (
                <option key={r.agent} value={r.agent}>{r.agent}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPicker(false)} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 13, cursor: 'pointer' }}>
                {t('cancel')}
              </button>
              <button
                onClick={handleExportNormal}
                disabled={exporting || !exportAgent}
                style={{ padding: '9px 20px', borderRadius: 6, border: 'none', background: exporting ? '#B0BEC5' : 'var(--color-primary)', color: 'white', fontSize: 13, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer' }}
              >
                {exporting ? '...' : t('cma_export_excel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FRP export picker modal */}
      {frpShowPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, padding: '32px 40px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', minWidth: 360,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: '#1B2A4A' }}>
              {t('cma_select_agent_export')}
            </div>
            <select
              value={frpExportAgent}
              onChange={e => setFrpExportAgent(e.target.value)}
              style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 14, marginBottom: 20 }}
            >
              <option value="__ALL__">— {t('cma_all_agents')} —</option>
              {frpReport?.map(r => (
                <option key={r.agent} value={r.agent}>{r.agent}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setFrpShowPicker(false)} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 13, cursor: 'pointer' }}>
                {t('cancel')}
              </button>
              <button
                onClick={handleExportFRP}
                disabled={frpExporting || !frpExportAgent}
                style={{ padding: '9px 20px', borderRadius: 6, border: 'none', background: frpExporting ? '#B0BEC5' : 'var(--color-primary)', color: 'white', fontSize: 13, fontWeight: 600, cursor: frpExporting ? 'not-allowed' : 'pointer' }}
              >
                {frpExporting ? '...' : t('cma_export_excel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
        📊 {tab === 'normal' ? t('cma_receipt_tab') : tab === 'frp' ? t('frp_receipt_tab') : t('gc_receipt_tab')}
      </h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--color-border)' }}>
        {[['normal', t('cma_receipt_tab')], ['frp', t('frp_receipt_tab')], ['gc', t('gc_receipt_tab')]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 24px', border: 'none', fontSize: 14, fontWeight: tab === key ? 700 : 500,
            background: 'none', cursor: 'pointer',
            color: tab === key ? 'var(--color-primary)' : 'var(--color-text-muted)',
            borderBottom: tab === key ? '3px solid var(--color-primary)' : '3px solid transparent',
            marginBottom: -2,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div style={{
        background: 'white', borderRadius: 8, padding: '18px 24px',
        border: '1px solid var(--color-border)', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>{t('cma_month')}</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            style={{ height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 14 }}
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>{t('cma_year')}</label>
          <input
            type="number"
            value={year}
            min={2020}
            max={2099}
            onChange={e => setYear(Number(e.target.value))}
            style={{ height: 38, width: 90, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 14 }}
          />
        </div>

        {tab === 'normal' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)} />
            {t('cma_detailed_report')}
          </label>
        )}

        <button
          onClick={handleGenerate}
          disabled={isLoading}
          style={{
            height: 38, padding: '0 24px', borderRadius: 6, border: 'none',
            background: isLoading ? '#B0BEC5' : 'var(--color-primary)',
            color: 'white', fontSize: 14, fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? '...' : t('cma_generate')}
        </button>

        {/* Normal tab extras */}
        {tab === 'normal' && report && report.length > 0 && (
          <button
            onClick={() => setShowPicker(true)}
            style={{ height: 38, padding: '0 20px', borderRadius: 6, border: '1px solid #27ae60', background: 'white', color: '#27ae60', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            ⬇ {t('cma_export_excel')}
          </button>
        )}
        {tab === 'normal' && visibleTrsRows.length > 0 && (
          <>
            <button
              onClick={handlePrintTRS}
              style={{ height: 38, padding: '0 20px', borderRadius: 6, border: '1px solid var(--color-primary)', background: 'white', color: 'var(--color-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              🖨 {t('print')}
            </button>
          </>
        )}
        {tab === 'normal' && report && (
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {['usd', 'lbp', 'both'].map(opt => (
              <button key={opt} onClick={() => setCurrency(opt)} style={{
                padding: '6px 14px', border: 'none', fontSize: 13, fontWeight: currency === opt ? 700 : 400,
                background: currency === opt ? 'var(--color-primary)' : 'white',
                color: currency === opt ? 'white' : 'var(--color-text-muted)',
                cursor: 'pointer',
              }}>
                {t(`cma_currency_${opt}`)}
              </button>
            ))}
          </div>
        )}
        {tab === 'normal' && (report || trsData) && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer', marginInlineStart: 'auto' }}>
            <input type="checkbox" checked={hideZeros} onChange={e => setHideZeros(e.target.checked)} />
            {t('cma_hide_zeros')}
          </label>
        )}

        {/* FRP tab extras */}
        {tab === 'frp' && frpReport && frpReport.length > 0 && (
          <>
            <button
              onClick={() => setFrpShowPicker(true)}
              style={{ height: 38, padding: '0 20px', borderRadius: 6, border: '1px solid #27ae60', background: 'white', color: '#27ae60', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              ⬇ {t('cma_export_excel')}
            </button>
            <button
              onClick={handlePrintFRP}
              style={{ height: 38, padding: '0 20px', borderRadius: 6, border: '1px solid var(--color-primary)', background: 'white', color: 'var(--color-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              🖨 {t('print')}
            </button>
          </>
        )}
        {tab === 'frp' && frpReport && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer', marginInlineStart: 'auto' }}>
            <input type="checkbox" checked={frpHideZeros} onChange={e => setFrpHideZeros(e.target.checked)} />
            {t('cma_hide_zeros')}
          </label>
        )}

        {/* GC extras */}
        {tab === 'gc' && gcReport && gcReport.length > 0 && (
          <button
            onClick={handlePrintGC}
            style={{ height: 38, padding: '0 20px', borderRadius: 6, border: '1px solid var(--color-primary)', background: 'white', color: 'var(--color-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            🖨 {t('print')}
          </button>
        )}
      </div>

      {/* ── Normal Receipt content ────────────────────────────────────────────── */}
      {tab === 'normal' && report !== null && (
        <>
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            {visibleRows.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
                {report.length === 0 ? t('cma_no_data') : t('cma_all_zeros_hidden')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, textAlign: 'left' }}>{t('shipping_agent')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_20ft_local')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_40ft_local')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_20ft_trans')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_40ft_trans')}</th>
                      <th style={{ ...TH, textAlign: 'right', borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_local_teus')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_trans_teus')}</th>
                      {(currency === 'usd' || currency === 'both') && <>
                        <th style={{ ...TH, textAlign: 'right', borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_local_fee')}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>{t('cma_trans_fee')}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>{t('cma_total')}</th>
                      </>}
                      {(currency === 'lbp' || currency === 'both') && <>
                        <th style={{ ...TH, textAlign: 'right', borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_local_fee_lbp')}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>{t('cma_trans_fee_lbp')}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>{t('cma_total_lbp')}</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(r => {
                      const localLbp = r.local_teus * LOCAL_LBP
                      const transLbp = r.trans_teus * TRANS_LBP
                      return (
                        <tr key={r.agent} style={{ transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFF'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={TD}>{r.agent}</td>
                          <td style={TDR}><span className="num-ltr">{r.local_20}</span></td>
                          <td style={TDR}><span className="num-ltr">{r.local_40}</span></td>
                          <td style={TDR}><span className="num-ltr">{r.trans_20}</span></td>
                          <td style={TDR}><span className="num-ltr">{r.trans_40}</span></td>
                          <td style={{ ...TDR, borderInlineStart: '1px solid #EEF0F6', fontWeight: 600 }}>
                            <span className="num-ltr">{r.local_teus}</span>
                          </td>
                          <td style={{ ...TDR, fontWeight: 600 }}>
                            <span className="num-ltr">{r.trans_teus}</span>
                          </td>
                          {(currency === 'usd' || currency === 'both') && <>
                            <td style={{ ...TDR, borderInlineStart: '1px solid #EEF0F6', color: '#1B2A4A' }}>
                              <span className="num-ltr">${fmt2(r.local_fee)}</span>
                            </td>
                            <td style={{ ...TDR, color: '#1B2A4A' }}>
                              <span className="num-ltr">${fmt2(r.trans_fee)}</span>
                            </td>
                            <td style={{ ...TDR, fontWeight: 700, color: '#1B2A4A' }}>
                              <span className="num-ltr">${fmt2(r.total)}</span>
                            </td>
                          </>}
                          {(currency === 'lbp' || currency === 'both') && <>
                            <td style={{ ...TDR, borderInlineStart: '1px solid #EEF0F6', color: '#1B2A4A' }}>
                              <span className="num-ltr">{localLbp.toLocaleString('en-US')}</span>
                            </td>
                            <td style={{ ...TDR, color: '#1B2A4A' }}>
                              <span className="num-ltr">{transLbp.toLocaleString('en-US')}</span>
                            </td>
                            <td style={{ ...TDR, fontWeight: 700, color: '#1B2A4A' }}>
                              <span className="num-ltr">{(localLbp + transLbp).toLocaleString('en-US')}</span>
                            </td>
                          </>}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...TDF, textAlign: 'left', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {t('total_records')}
                      </td>
                      <td style={TDF}><span className="num-ltr">{totals.local_20}</span></td>
                      <td style={TDF}><span className="num-ltr">{totals.local_40}</span></td>
                      <td style={TDF}><span className="num-ltr">{totals.trans_20}</span></td>
                      <td style={TDF}><span className="num-ltr">{totals.trans_40}</span></td>
                      <td style={{ ...TDF, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">{totals.local_teus}</span></td>
                      <td style={TDF}><span className="num-ltr">{totals.trans_teus}</span></td>
                      {(currency === 'usd' || currency === 'both') && <>
                        <td style={{ ...TDF, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">${fmt2(totals.local_fee)}</span></td>
                        <td style={TDF}><span className="num-ltr">${fmt2(totals.trans_fee)}</span></td>
                        <td style={{ ...TDF, fontSize: 15 }}><span className="num-ltr">${fmt2(totals.total)}</span></td>
                      </>}
                      {(currency === 'lbp' || currency === 'both') && <>
                        <td style={{ ...TDF, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">{(totals.local_teus * LOCAL_LBP).toLocaleString('en-US')}</span></td>
                        <td style={TDF}><span className="num-ltr">{(totals.trans_teus * TRANS_LBP).toLocaleString('en-US')}</span></td>
                        <td style={{ ...TDF, fontSize: 15 }}><span className="num-ltr">{(totals.local_teus * LOCAL_LBP + totals.trans_teus * TRANS_LBP).toLocaleString('en-US')}</span></td>
                      </>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          {report.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
              <div>{t('cma_rates_note')}</div>
              <div style={{ marginTop: 2 }}>{t('cma_rates_note_lbp')}</div>
            </div>
          )}
        </>
      )}

      {/* ── Normal Detailed (TRS) content ─────────────────────────────────────── */}
      {tab === 'normal' && trsData !== null && (
        <>
          {visibleTrsRows.length > 0 && (
            <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ flex: 1, padding: '16px 24px', textAlign: 'center', background: 'white' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total TEUs</div>
                <div className="num-ltr" style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text)' }}>{(trsTotals.local_teus + trsTotals.trans_teus).toLocaleString('en-US')}</div>
              </div>
              <div style={{ flex: 1, padding: '16px 24px', textAlign: 'center', background: 'white', borderInlineStart: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('cma_total')}</div>
                <div className="num-ltr" style={{ fontSize: 26, fontWeight: 700, color: '#1B2A4A' }}>${fmt2(trsTotals.total)}</div>
              </div>
              <div style={{ flex: 1, padding: '16px 24px', textAlign: 'center', background: 'white', borderInlineStart: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('cma_total_lbp')}</div>
                <div className="num-ltr" style={{ fontSize: 26, fontWeight: 700, color: '#1B2A4A' }}>{trsTotals.total_lbp.toLocaleString('en-US')}</div>
              </div>
            </div>
          )}
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            {visibleTrsRows.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
                {trsData.length === 0 ? t('cma_no_data') : t('cma_all_zeros_hidden')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, textAlign: 'left' }}>{t('shipping_agent')}</th>
                      <th style={{ ...TH, textAlign: 'left' }}>{t('voyage_number')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_20ft_local')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_40ft_local')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_20ft_trans')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_40ft_trans')}</th>
                      <th style={{ ...TH, textAlign: 'right', borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_local_teus')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_trans_teus')}</th>
                      <th style={{ ...TH, textAlign: 'right', borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_total')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_total_lbp')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrsRows.map(r => (
                      <tr key={r.voyage_number} style={{ transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFF'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={TD}>{r.agent}</td>
                        <td style={TD}><span className="num-ltr">{r.voyage_number}</span></td>
                        <td style={TDR}><span className="num-ltr">{r.local_20}</span></td>
                        <td style={TDR}><span className="num-ltr">{r.local_40}</span></td>
                        <td style={TDR}><span className="num-ltr">{r.trans_20}</span></td>
                        <td style={TDR}><span className="num-ltr">{r.trans_40}</span></td>
                        <td style={{ ...TDR, borderInlineStart: '1px solid #EEF0F6', fontWeight: 600 }}><span className="num-ltr">{r.local_teus}</span></td>
                        <td style={{ ...TDR, fontWeight: 600 }}><span className="num-ltr">{r.trans_teus}</span></td>
                        <td style={{ ...TDR, borderInlineStart: '1px solid #EEF0F6', fontWeight: 700, color: '#1B2A4A' }}><span className="num-ltr">${fmt2(r.total)}</span></td>
                        <td style={{ ...TDR, fontWeight: 700, color: '#1B2A4A' }}><span className="num-ltr">{(r.local_lbp + r.trans_lbp).toLocaleString('en-US')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...TDF, textAlign: 'left', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }} colSpan={2}>{t('total_records')}</td>
                      <td style={TDF}><span className="num-ltr">{trsTotals.local_20}</span></td>
                      <td style={TDF}><span className="num-ltr">{trsTotals.local_40}</span></td>
                      <td style={TDF}><span className="num-ltr">{trsTotals.trans_20}</span></td>
                      <td style={TDF}><span className="num-ltr">{trsTotals.trans_40}</span></td>
                      <td style={{ ...TDF, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">{trsTotals.local_teus}</span></td>
                      <td style={TDF}><span className="num-ltr">{trsTotals.trans_teus}</span></td>
                      <td style={{ ...TDF, fontSize: 15, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">${fmt2(trsTotals.total)}</span></td>
                      <td style={{ ...TDF, fontSize: 15 }}><span className="num-ltr">{trsTotals.total_lbp.toLocaleString('en-US')}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── FRP Receipt content ───────────────────────────────────────────────── */}
      {tab === 'frp' && frpReport !== null && (
        <>
          {visibleFrpRows.length > 0 && (
            <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ flex: 1, padding: '16px 24px', textAlign: 'center', background: 'white' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total TEUs</div>
                <div className="num-ltr" style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text)' }}>{frpTotals.frp_teus.toLocaleString('en-US')}</div>
              </div>
              <div style={{ flex: 1, padding: '16px 24px', textAlign: 'center', background: 'white', borderInlineStart: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('cma_total')} ($)</div>
                <div className="num-ltr" style={{ fontSize: 26, fontWeight: 700, color: '#1B2A4A' }}>${fmt2(frpTotals.fee)}</div>
              </div>
            </div>
          )}
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            {visibleFrpRows.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
                {frpReport.length === 0 ? t('cma_no_data') : t('cma_all_zeros_hidden')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, textAlign: 'left' }}>{t('shipping_agent')}</th>
                      <th style={{ ...TH, textAlign: 'right' }}>20ft</th>
                      <th style={{ ...TH, textAlign: 'right' }}>40ft</th>
                      <th style={{ ...TH, textAlign: 'right', borderInlineStart: '1px solid #D0D8EC' }}>TEUs</th>
                      <th style={{ ...TH, textAlign: 'right' }}>{t('cma_total')} ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFrpRows.map(r => (
                      <tr key={r.agent} style={{ transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFF'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={TD}>{r.agent}</td>
                        <td style={TDR}><span className="num-ltr">{r.frp_20}</span></td>
                        <td style={TDR}><span className="num-ltr">{r.frp_40}</span></td>
                        <td style={{ ...TDR, borderInlineStart: '1px solid #EEF0F6', fontWeight: 600 }}>
                          <span className="num-ltr">{r.frp_teus}</span>
                        </td>
                        <td style={{ ...TDR, fontWeight: 700, color: '#1B2A4A' }}>
                          <span className="num-ltr">${fmt2(r.fee)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...TDF, textAlign: 'left', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {t('total_records')}
                      </td>
                      <td style={TDF}><span className="num-ltr">{frpTotals.frp_20}</span></td>
                      <td style={TDF}><span className="num-ltr">{frpTotals.frp_40}</span></td>
                      <td style={{ ...TDF, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">{frpTotals.frp_teus}</span></td>
                      <td style={{ ...TDF, fontSize: 15 }}><span className="num-ltr">${fmt2(frpTotals.fee)}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          {frpReport.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
              FRP rate: $10.45/TEU (20ft = 1 TEU, 40ft = 2 TEUs)
            </div>
          )}
        </>
      )}

      {/* ── GC content ───────────────────────────────────────────────────────── */}
      {tab === 'gc' && gcReport !== null && (
        <div>
          {gcReport.length === 0 ? (
            <div style={{
              background: 'white', borderRadius: 8, border: '1px solid var(--color-border)',
              padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14,
            }}>
              {t('gc_receipt_no_data')}
            </div>
          ) : (
            <>
              {gcReport.map(voyage => (
                <div key={voyage.voyage_number} style={{
                  background: 'white', borderRadius: 8, border: '1px solid var(--color-border)',
                  marginBottom: 16, overflow: 'hidden',
                }}>
                  <div style={{
                    background: '#F0F4FF', padding: '10px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid #D0D8EC',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1B2A4A' }}>
                      {t('voyage_number')}: <span className="num-ltr">{voyage.voyage_number}</span>{voyage.vessel_name ? ` — ${voyage.vessel_name}` : ''}
                    </span>
                    <span style={{ fontSize: 13, color: '#555' }}>
                      {t('shipping_agent')}: {voyage.shipping_agent}
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, textAlign: 'left' }}>{t('gc_receipt_code')}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>{t('gc_receipt_original_value')}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>{t('gc_receipt_billable_35')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voyage.lines.map(line => (
                        <tr key={line.service_code}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFF'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          style={{ transition: 'background 0.1s' }}
                        >
                          <td style={TD}><strong style={{ color: 'var(--color-primary)' }}>{line.service_code}</strong></td>
                          <td style={TDR}><span className="num-ltr">${fmt2(line.original)}</span></td>
                          <td style={TDR}><span className="num-ltr">${fmt2(line.billable)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ ...TDF, textAlign: 'left', fontSize: 12 }} colSpan={2}>
                          {t('gc_voyage_subtotal')}
                        </td>
                        <td style={TDF}><span className="num-ltr">${fmt2(voyage.subtotal)}</span></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}

              <div style={{
                background: '#1B2A4A', color: 'white', borderRadius: 8,
                padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 4,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {t('gc_grand_total')}
                </span>
                <span className="num-ltr" style={{ fontSize: 18, fontWeight: 700 }}>
                  ${fmt2(gcGrandTotal)}
                </span>
              </div>

              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-muted)' }}>
                {t('gc_receipt_note')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
