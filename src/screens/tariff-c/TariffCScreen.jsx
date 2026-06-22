import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import { calculateReceipt } from '../../logic/receiptCalc.js'
import TariffCReceiptPreview from './TariffCReceiptPreview.jsx'

function buildServiceRows(storageAmount) {
  return [
    { service_code: 'ECM',   quantity: 1, price_per_unit: storageAmount, line_total: storageAmount, is_taxable: 0, is_fixed: 0, is_auto: 0 },
    { service_code: 'AUTOM', quantity: 1, price_per_unit: 1.00, line_total: 1.00, is_taxable: 0, is_fixed: 1, is_auto: 0 },
    { service_code: 'BILLF', quantity: 1, price_per_unit: 1.00, line_total: 1.00, is_taxable: 0, is_fixed: 1, is_auto: 0 },
    { service_code: 'STAMP', quantity: 1, price_per_unit: 2.00, line_total: 2.00, is_taxable: 0, is_fixed: 0, is_auto: 1 },
  ]
}

// phase: 'idle' | 'file_loaded' | 'folder_selected' | 'generating' | 'done'
export default function TariffCScreen() {
  const { t } = useTranslation()
  const { session } = useSession()

  const [phase, setPhase]           = useState('idle')
  const [period, setPeriod]         = useState('')
  const [agencies, setAgencies]     = useState([])
  const [folderPath, setFolderPath] = useState('')
  const [loadError, setLoadError]   = useState(null)
  const [progress, setProgress]     = useState({ current: 0, total: 0 })
  const [result, setResult]         = useState(null) // { count, errors }

  // Batch PDF export — same Promise+ref pattern as BatchImport
  const pdfResolveRef = useRef(null)
  const [pdfExportItem, setPdfExportItem] = useState(null) // { agencyData, billingNumber, filePath }

  async function handleOpenFile() {
    const res = await window.api.tariffCOpenFile()
    if (!res.success || res.canceled) return
    setLoadError(null)
    const parsed = await window.api.tariffCReadFile(res.filePath)
    if (!parsed.success) { setLoadError(parsed.error || 'Failed to read file'); return }
    setPeriod(parsed.data.period)
    setAgencies(parsed.data.agencies)
    setFolderPath('')
    setResult(null)
    setPhase('file_loaded')
  }

  async function handlePickFolder() {
    const res = await window.api.tariffCPickFolder()
    if (!res.success || res.canceled) return
    setFolderPath(res.folderPath)
    setPhase('folder_selected')
  }

  async function handleGenerateAll() {
    if (!agencies.length || !folderPath) return
    setPhase('generating')
    setProgress({ current: 0, total: agencies.length })

    let count = 0
    const errors = []

    for (let i = 0; i < agencies.length; i++) {
      const agency = agencies[i]
      setProgress({ current: i + 1, total: agencies.length })

      // Get next billing number before rendering so the PDF shows the correct number
      const bnRes = await window.api.tariffCGetNextBillingNumber()
      if (!bnRes.success) { errors.push(agency.agencyName); continue }

      // Build file path: [AgencyName]_[Period].pdf
      const safeName = agency.agencyName.replace(/[/\\:*?"<>|]/g, '_')
      const filePath = `${folderPath}\\${safeName}_${period}.pdf`

      // Render receipt and silently export PDF
      const pdfError = await new Promise(resolve => {
        pdfResolveRef.current = resolve
        setPdfExportItem({ agencyData: agency, billingNumber: bnRes.next, filePath })
      })
      setPdfExportItem(null)

      if (pdfError) { errors.push(agency.agencyName); continue }

      // Save to DB (atomically increments billing counter)
      const calc = calculateReceipt({ berthingRows: [], serviceRows: buildServiceRows(agency.storageAmount), moduleType: 'GC', vesselType: null })
      const saveRes = await window.api.tariffCSaveReceipt({
        agencyName:        agency.agencyName,
        period,
        snapshot: {
          period,
          billingNumber: bnRes.next,
          agencyData: agency,
          serviceRows: buildServiceRows(agency.storageAmount),
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

      if (saveRes.success) count++
      else errors.push(agency.agencyName)
    }

    setResult({ count, errors })
    setPhase('done')
  }

  function handleReset() {
    setPhase('idle')
    setPeriod('')
    setAgencies([])
    setFolderPath('')
    setResult(null)
    setLoadError(null)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720 }}>
      {/* Title */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>{t('tariff_c')}</div>
        <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{t('tariff_c_description')}</div>
      </div>

      {/* Error */}
      {loadError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 16px', color: '#991B1B', fontSize: 13, marginBottom: 20 }}>
          {loadError}
        </div>
      )}

      {/* ── Phase: idle — drop zone with centered + button ── */}
      {phase === 'idle' && (
        <div
          onClick={handleOpenFile}
          style={{
            border: '2px dashed var(--color-border)',
            borderRadius: 12,
            background: '#FAFBFC',
            padding: '72px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = '#F0F6FF' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = '#FAFBFC' }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--color-primary)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 300, margin: '0 auto 16px',
            lineHeight: 1,
          }}>
            +
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
            {t('tc_no_file')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            Empty_Storage_Summary_YYYY-MM.xlsx
          </div>
        </div>
      )}

      {/* ── Phase: file_loaded — show info + folder picker ── */}
      {phase === 'file_loaded' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 22px' }}>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>{t('period_label')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>{period}</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 8 }}>
              {agencies.length} {agencies.length === 1 ? 'agency' : 'agencies'}
            </div>
          </div>

          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }}>{t('tc_folder_label')}</div>
            <button
              onClick={handlePickFolder}
              style={{
                padding: '10px 22px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: '1px solid var(--color-primary)', background: 'white',
                color: 'var(--color-primary)', cursor: 'pointer',
              }}
            >
              📁 {t('tc_pick_folder')}
            </button>
          </div>

          <button
            onClick={handleReset}
            style={{ alignSelf: 'flex-start', padding: '7px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 13 }}
          >
            ← {t('go_back')}
          </button>
        </div>
      )}

      {/* ── Phase: folder_selected — show folder + generate button ── */}
      {phase === 'folder_selected' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 22px' }}>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>{t('period_label')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', marginBottom: 12 }}>{period}</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>{t('tc_folder_label')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {folderPath}
            </div>
            <button
              onClick={handlePickFolder}
              style={{ marginTop: 10, padding: '6px 14px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 12 }}
            >
              {t('tc_pick_folder')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleGenerateAll}
              style={{
                padding: '12px 28px', borderRadius: 6, border: 'none',
                background: 'var(--color-primary)', color: 'white',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ▶ {t('tc_generate_all')} ({agencies.length})
            </button>
            <button
              onClick={handleReset}
              style={{ padding: '12px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)', cursor: 'pointer', fontSize: 13 }}
            >
              ← {t('go_back')}
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: generating — progress ── */}
      {phase === 'generating' && (
        <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 20 }}>
            {t('tc_generating')}
          </div>
          <div style={{ width: '100%', height: 10, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              height: '100%',
              width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              background: 'linear-gradient(90deg, #1B2A4A, #3B5998)',
              borderRadius: 99, transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            <span className="num-ltr">{progress.current}</span> / <span className="num-ltr">{progress.total}</span>
          </div>
        </div>
      )}

      {/* ── Phase: done — success message ── */}
      {phase === 'done' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: result.errors.length === 0 ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${result.errors.length === 0 ? '#BBF7D0' : '#FDE68A'}`,
            borderRadius: 8, padding: '24px 28px',
          }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>{result.errors.length === 0 ? '✅' : '⚠'}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>
              {t('tc_done_title')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6 }}>
              {t('tc_success', { count: result.count, folder: folderPath })}
            </div>
            {result.errors.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#B45309' }}>
                Failed: {result.errors.join(', ')}
              </div>
            )}
          </div>
          <button
            onClick={handleReset}
            style={{ alignSelf: 'flex-start', padding: '10px 22px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {t('tc_load_another')}
          </button>
        </div>
      )}

      {/* Batch PDF export — one agency at a time, resolved by Promise */}
      {pdfExportItem && (
        <TariffCReceiptPreview
          agencyData={pdfExportItem.agencyData}
          period={period}
          billingNumber={pdfExportItem.billingNumber}
          autoExportPath={pdfExportItem.filePath}
          onAutoExportDone={error => {
            if (pdfResolveRef.current) {
              pdfResolveRef.current(error)
              pdfResolveRef.current = null
            }
          }}
          onClose={() => {}}
        />
      )}
    </div>
  )
}
