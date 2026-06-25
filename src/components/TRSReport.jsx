import { useMemo } from 'react'
import portLogo from '../assets/port-logo.jpg'
import { useTranslation } from 'react-i18next'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt2(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TH = {
  padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#1B2A4A', background: '#F0F4FF',
  border: '1px solid #D0D8EC', whiteSpace: 'nowrap',
}
const TD  = { padding: '6px 10px', fontSize: 11, border: '1px solid #EEF0F6', whiteSpace: 'nowrap' }
const TDR = { ...TD, textAlign: 'right' }
const TDB = { ...TD, fontWeight: 600 }

export default function TRSReport({ data, year, month, onClose, onPrint, onExport }) {
  const { t } = useTranslation()
  const totals = useMemo(() => data.reduce((acc, r) => ({
    local_20:   acc.local_20   + r.local_20,
    local_40:   acc.local_40   + r.local_40,
    trans_20:   acc.trans_20   + r.trans_20,
    trans_40:   acc.trans_40   + r.trans_40,
    local_teus: acc.local_teus + r.local_teus,
    trans_teus: acc.trans_teus + r.trans_teus,
    total_usd:  acc.total_usd  + r.total,
    total_lbp:  acc.total_lbp  + r.local_lbp + r.trans_lbp,
  }), { local_20:0, local_40:0, trans_20:0, trans_40:0, local_teus:0, trans_teus:0, total_usd:0, total_lbp:0 }), [data])

  const grandTeus = totals.local_teus + totals.trans_teus
  const period    = `${MONTHS_SHORT[month - 1]}-${String(year).slice(-2)}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto', padding: 0 }}>
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 1, background: 'white',
        borderBottom: '1px solid #D0D8EC', padding: '10px 60px',
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 13, cursor: 'pointer' }}>
          ✕ {t('close')}
        </button>
        <button onClick={onPrint} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--color-primary)', background: 'white', color: 'var(--color-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🖨 {t('print')}
        </button>
        <button onClick={onExport} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #27ae60', background: 'white', color: '#27ae60', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ⬇ {t('cma_export_excel')}
        </button>
      </div>
      <div style={{ maxWidth: 920, margin: '0 auto', fontFamily: 'serif', padding: '40px 60px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, borderBottom: '2px solid #1B2A4A', paddingBottom: 16 }}>
          <img src={portLogo} alt="Port of Beirut" style={{ height: 64, width: 'auto' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1B2A4A' }}>Port of Beirut — مرفأ بيروت</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>TRS Report</div>
          </div>
        </div>

        {/* Summary block */}
        <table style={{ borderCollapse: 'collapse', fontSize: 11, marginBottom: 24 }}>
          <tbody>
            <tr>
              <td style={TDB}>Year</td>
              <td style={{ ...TDR, minWidth: 140 }}><span className="num-ltr">{year}</span></td>
            </tr>
            <tr>
              <td style={TDB}>Period</td>
              <td style={TDR}><span className="num-ltr">{period}</span></td>
            </tr>
            <tr>
              <td style={TD}></td>
              <td style={{ ...TDR, fontWeight: 700 }}>TRS</td>
            </tr>
            <tr>
              <td style={TDB}>20 Ft.</td>
              <td style={TDR}><span className="num-ltr">{totals.local_20} / {totals.trans_20}</span></td>
            </tr>
            <tr>
              <td style={TDB}>40 Ft.</td>
              <td style={TDR}><span className="num-ltr">{totals.local_40} / {totals.trans_40}</span></td>
            </tr>
            <tr>
              <td style={TD}></td>
              <td style={{ ...TDR, fontWeight: 600 }}>
                <span className="num-ltr">{totals.local_20 + totals.local_40} / {totals.trans_20 + totals.trans_40}</span>
              </td>
            </tr>
            <tr>
              <td style={TDB}>$</td>
              <td style={{ ...TDR, fontWeight: 700 }}><span className="num-ltr">${fmt2(totals.total_usd)}</span></td>
            </tr>
            <tr>
              <td style={TDB}>L.L</td>
              <td style={{ ...TDR, fontWeight: 700 }}><span className="num-ltr">{totals.total_lbp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
            </tr>
            <tr>
              <td style={TDB}>TEU</td>
              <td style={{ ...TDR, fontWeight: 700 }}><span className="num-ltr">{grandTeus}</span></td>
            </tr>
          </tbody>
        </table>

        {/* Voyage table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'left' }}>Agent</th>
              <th style={{ ...TH, textAlign: 'left' }}>Voyage #</th>
              <th style={{ ...TH, textAlign: 'right' }}>20ft Local</th>
              <th style={{ ...TH, textAlign: 'right' }}>40ft Local</th>
              <th style={{ ...TH, textAlign: 'right' }}>20ft Trans</th>
              <th style={{ ...TH, textAlign: 'right' }}>40ft Trans</th>
              <th style={{ ...TH, textAlign: 'right' }}>Local TEUs</th>
              <th style={{ ...TH, textAlign: 'right' }}>Trans TEUs</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => {
              const empty = r.local_20 === 0 && r.local_40 === 0 && r.trans_20 === 0 && r.trans_40 === 0
              const n = (v) => empty ? '-' : <span className="num-ltr">{v}</span>
              return (
                <tr key={r.voyage_number}>
                  <td style={TD}>{r.agent}</td>
                  <td style={TD}><span className="num-ltr">{r.voyage_number}</span></td>
                  <td style={TDR}>{n(r.local_20)}</td>
                  <td style={TDR}>{n(r.local_40)}</td>
                  <td style={TDR}>{n(r.trans_20)}</td>
                  <td style={TDR}>{n(r.trans_40)}</td>
                  <td style={{ ...TDR, fontWeight: 600 }}>{n(r.local_teus)}</td>
                  <td style={{ ...TDR, fontWeight: 600 }}>{n(r.trans_teus)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
