import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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

  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [report, setReport]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [hideZeros, setHideZeros] = useState(true)
  const [toast, setToast]     = useState(null)

  // Export picker state
  const [showPicker, setShowPicker]   = useState(false)
  const [exportAgent, setExportAgent] = useState('')
  const [exporting, setExporting]     = useState(false)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleGenerate() {
    setLoading(true)
    setReport(null)
    const res = await window.api.cmaGetReport(year, month)
    setLoading(false)
    if (!res.success) { showToast(res.error || t('cma_error_load'), 'error'); return }
    setReport(res.data)
    if (res.data.length > 0) setExportAgent(res.data[0].agent)
  }

  async function handleExport() {
    if (!exportAgent) return
    setExporting(true)
    const res = await window.api.cmaExportExcel(year, month, exportAgent)
    setExporting(false)
    setShowPicker(false)
    if (res.canceled) return
    if (res.success) showToast(t('cma_export_success'))
    else showToast(res.error || t('cma_export_failed'), 'error')
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

      {/* Agent export picker modal */}
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
              style={{
                width: '100%', height: 44, padding: '0 12px', borderRadius: 6,
                border: '1px solid var(--color-border)', fontSize: 14, marginBottom: 20,
              }}
            >
              {report?.map(r => (
                <option key={r.agent} value={r.agent}>{r.agent}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPicker(false)}
                style={{
                  padding: '9px 20px', borderRadius: 6, border: '1px solid var(--color-border)',
                  background: 'white', fontSize: 13, cursor: 'pointer',
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || !exportAgent}
                style={{
                  padding: '9px 20px', borderRadius: 6, border: 'none',
                  background: exporting ? '#B0BEC5' : 'var(--color-primary)',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: exporting ? 'not-allowed' : 'pointer',
                }}
              >
                {exporting ? '...' : t('cma_export_excel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
        📊 {t('cma_receipt')}
      </h2>

      {/* Controls */}
      <div style={{
        background: 'white', borderRadius: 8, padding: '18px 24px',
        border: '1px solid var(--color-border)', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>
            {t('cma_month')}
          </label>
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
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>
            {t('cma_year')}
          </label>
          <input
            type="number"
            value={year}
            min={2020}
            max={2099}
            onChange={e => setYear(Number(e.target.value))}
            style={{ height: 38, width: 90, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 14 }}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            height: 38, padding: '0 24px', borderRadius: 6, border: 'none',
            background: loading ? '#B0BEC5' : 'var(--color-primary)',
            color: 'white', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '...' : t('cma_generate')}
        </button>

        {report && report.length > 0 && (
          <button
            onClick={() => setShowPicker(true)}
            style={{
              height: 38, padding: '0 20px', borderRadius: 6,
              border: '1px solid #27ae60', background: 'white',
              color: '#27ae60', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ⬇ {t('cma_export_excel')}
          </button>
        )}

        {report && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer', marginInlineStart: 'auto' }}>
            <input
              type="checkbox"
              checked={hideZeros}
              onChange={e => setHideZeros(e.target.checked)}
            />
            {t('cma_hide_zeros')}
          </label>
        )}
      </div>

      {/* Report table */}
      {report !== null && (
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
                    <th style={{ ...TH, textAlign: 'right', borderInlineStart: '1px solid #D0D8EC' }}>{t('cma_local_fee')}</th>
                    <th style={{ ...TH, textAlign: 'right' }}>{t('cma_trans_fee')}</th>
                    <th style={{ ...TH, textAlign: 'right' }}>{t('cma_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => (
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
                      <td style={{ ...TDR, borderInlineStart: '1px solid #EEF0F6', color: '#1B2A4A' }}>
                        <span className="num-ltr">${fmt2(r.local_fee)}</span>
                      </td>
                      <td style={{ ...TDR, color: '#1B2A4A' }}>
                        <span className="num-ltr">${fmt2(r.trans_fee)}</span>
                      </td>
                      <td style={{ ...TDR, fontWeight: 700, color: '#1B2A4A' }}>
                        <span className="num-ltr">${fmt2(r.total)}</span>
                      </td>
                    </tr>
                  ))}
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
                    <td style={{ ...TDF, borderInlineStart: '1px solid #D0D8EC' }}><span className="num-ltr">${fmt2(totals.local_fee)}</span></td>
                    <td style={TDF}><span className="num-ltr">${fmt2(totals.trans_fee)}</span></td>
                    <td style={{ ...TDF, fontSize: 15 }}><span className="num-ltr">${fmt2(totals.total)}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rates footnote */}
      {report && report.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
          {t('cma_rates_note')}
        </div>
      )}
    </div>
  )
}
