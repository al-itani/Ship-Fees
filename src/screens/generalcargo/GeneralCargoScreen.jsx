import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import GCCodeSelect from '../../components/GCCodeSelect.jsx'

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcLineTotal(qty, rate, minimum) {
  if (isNaN(qty) || isNaN(rate) || qty <= 0) return null
  const raw = qty * rate
  return minimum > 0 ? Math.max(raw, minimum) : raw
}

const EMPTY_LINE = { codeObj: null, qty: '', rate: '' }

const thStyle = {
  padding: '9px 16px', textAlign: 'start', fontWeight: 600,
  fontSize: 12, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.03em',
}
const tdStyle = { padding: '10px 16px', verticalAlign: 'middle', fontSize: 13 }

export default function GeneralCargoScreen({ initialVoyage, onVoyageConsumed, onGenerateReceipt }) {
  const { t } = useTranslation()
  const { session } = useSession()

  const [phase, setPhase] = useState('lookup')
  const [voyageInput, setVoyageInput] = useState('')
  const [voyageError, setVoyageError] = useState('')
  const [looking, setLooking] = useState(false)

  const [voyageInfo, setVoyageInfo] = useState(null)
  const [codes, setCodes] = useState([])

  const [line, setLine] = useState(EMPTY_LINE)
  const [lineError, setLineError] = useState('')

  const [pendingLines, setPendingLines] = useState([])
  const [savedLines, setSavedLines] = useState([])

  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const codeInputRef = useRef(null)

  // Load codes once
  useEffect(() => {
    window.api.gcGetCodes().then(res => {
      if (res.success) setCodes(res.data)
    })
  }, [])

  // Auto-lookup when navigated from Berthing with a voyage number
  useEffect(() => {
    if (!initialVoyage) return
    onVoyageConsumed?.()
    setVoyageInput(initialVoyage)
    handleLookup(initialVoyage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVoyage])

  // Auto-fill rate when code changes
  useEffect(() => {
    if (!line.codeObj) return
    const rate = line.codeObj.rate !== null && line.codeObj.rate !== undefined
      ? String(line.codeObj.rate)
      : ''
    setLine(prev => ({ ...prev, rate }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.codeObj])

  // Enter/Escape for save confirm modal
  useEffect(() => {
    if (!showSaveConfirm) return
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); doConfirmSave() }
      if (e.key === 'Escape') { e.preventDefault(); setShowSaveConfirm(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSaveConfirm])

  const qtyNum  = parseFloat(line.qty)
  const rateNum = parseFloat(line.rate)
  const minimum = line.codeObj?.minimum || 0
  const lineTotal = !isNaN(qtyNum) && !isNaN(rateNum) && qtyNum > 0
    ? calcLineTotal(qtyNum, rateNum, minimum)
    : null
  const minimumApplied = lineTotal !== null && minimum > 0 && (qtyNum * rateNum) < minimum

  const pendingSubtotal = pendingLines.reduce((s, l) => s + l.line_total, 0)

  async function loadSavedLines(voyageNumber) {
    const res = await window.api.gcGetLines(voyageNumber)
    if (res.success) setSavedLines(res.data)
  }

  function handleImportExtracted({ fields, uncertain, error }) {
    if (error) { showToast(error, 'error'); return }
    if (!fields) return

    if (fields.voyage_number) {
      setVoyageInput(String(fields.voyage_number))
      setVoyageError('')
    }

    const importedLines = (fields.services || [])
      .filter(s => s.code)
      .map(s => {
        const matchedCode = codes.find(c => c.code.toLowerCase() === String(s.code).toLowerCase())
        const qty   = Number(s.quantity) || 1
        const rate  = Number(s.price_per_unit) ?? (matchedCode?.rate ?? 0)
        const min   = matchedCode?.minimum || 0
        const total = min > 0 ? Math.max(qty * rate, min) : qty * rate
        return {
          service_code:    matchedCode?.code || String(s.code).toUpperCase(),
          description:     matchedCode?.description || '',
          unit:            matchedCode?.unit || '',
          quantity:        qty,
          rate,
          minimum:         min,
          line_total:      total,
          minimum_applied: min > 0 && qty * rate < min ? 1 : 0,
          is_taxable:      matchedCode?.is_taxable || 0,
          _imported:       true,
          _uncertain:      uncertain?.has('services') || !matchedCode,
        }
      })
    if (importedLines.length > 0) setPendingLines(importedLines)

    showToast(t('import_applied'), 'success')
  }

  async function handleLookup(vnOverride) {
    const vn = (vnOverride || voyageInput).trim()
    if (!vn) return
    setVoyageError('')
    setLooking(true)
    try {
      const res = await window.api.gcLookupVoyage(vn)
      if (!res.success) {
        const msg = res.error === 'voyage_not_found'   ? t('voyage_not_found')
          : res.error === 'voyage_is_container' ? t('voyage_is_container')
          : res.error
        setVoyageError(msg)
      } else {
        setVoyageInfo(res.data)
        setPhase('entry')
        setPendingLines([])
        setLine(EMPTY_LINE)
        setLineError('')
        await loadSavedLines(vn)
      }
    } finally {
      setLooking(false)
    }
  }

  function handleAddLine() {
    if (!line.codeObj)   { setLineError(t('line_code_required')); return }
    if (!line.qty || parseFloat(line.qty) <= 0) { setLineError(t('line_qty_required')); return }
    if (line.rate === '' || isNaN(parseFloat(line.rate))) { setLineError(t('line_rate_required')); return }

    setLineError('')
    const qty  = parseFloat(line.qty)
    const rate = parseFloat(line.rate)
    const min  = line.codeObj.minimum || 0
    const total = calcLineTotal(qty, rate, min)
    const minApplied = min > 0 && (qty * rate) < min ? 1 : 0

    setPendingLines(prev => [...prev, {
      service_code:    line.codeObj.code,
      description:     line.codeObj.description,
      unit:            line.codeObj.unit || '',
      quantity:        qty,
      rate,
      minimum:         min,
      line_total:      total,
      minimum_applied: minApplied,
      is_taxable:      line.codeObj.is_taxable || 0,
    }])
    setLine(EMPTY_LINE)
    setTimeout(() => codeInputRef.current?.focus(), 50)
  }

  function handleRemovePending(idx) {
    setPendingLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleDeleteSaved(id) {
    const res = await window.api.gcDeleteLine(id, session.id)
    if (res.success) {
      showToast(t('record_deleted'), 'success')
      await loadSavedLines(voyageInfo.berthing.voyage_number)
    } else {
      showToast(res.error, 'error')
    }
  }

  function handleSaveSession() {
    if (pendingLines.length === 0) { showToast(t('no_lines_to_save'), 'error'); return }
    setShowSaveConfirm(true)
  }

  async function doConfirmSave() {
    setSaving(true)
    setShowSaveConfirm(false)
    const { berthing } = voyageInfo
    const res = await window.api.gcSaveSession({
      voyageNumber: berthing.voyage_number,
      vesselName:   berthing.vessel_name,
      vesselType:   berthing.vessel_type,
      lines:        pendingLines,
      created_by:   session.id,
    })
    setSaving(false)
    if (res.success) {
      showToast(t('session_saved'), 'success')
      setPendingLines([])
      await loadSavedLines(berthing.voyage_number)
    } else {
      showToast(res.error, 'error')
    }
  }

  function handleChangeVoyage() {
    setPhase('lookup')
    setVoyageInfo(null)
    setSavedLines([])
    setPendingLines([])
    setLine(EMPTY_LINE)
    setLineError('')
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fieldStyle = {
    height: 44, padding: '0 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 6, fontSize: 14, outline: 'none',
    background: 'white', boxSizing: 'border-box',
  }
  const labelStyle = {
    fontSize: 13, fontWeight: 500,
    color: 'var(--color-text-muted)',
    display: 'block', marginBottom: 4,
  }

  const userSavedLines   = savedLines.filter(l => !l.is_fixed && !l.is_auto)
  const systemSavedLines = savedLines.filter(l => l.is_fixed || l.is_auto)
  const savedTotal       = savedLines.reduce((s, l) => s + l.line_total, 0)

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? '#27ae60' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
        📋 {t('general_cargo')}
      </h2>

      {/* ── LOOKUP ── */}
      {phase === 'lookup' && (
        <div style={{
          background: 'white', borderRadius: 8, padding: 28,
          border: '1px solid var(--color-border)', maxWidth: 480,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 20 }}>
            {t('open_voyage')}
          </div>
          <label style={labelStyle}>{t('voyage_number')}</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              style={{ ...fieldStyle, flex: 1 }}
              value={voyageInput}
              onChange={e => { setVoyageInput(e.target.value); setVoyageError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleLookup() }}
              placeholder={t('voyage_number')}
              autoFocus
            />
            <button
              onClick={handleLookup}
              disabled={looking || !voyageInput.trim()}
              style={{
                padding: '0 24px', height: 44, borderRadius: 6, border: 'none',
                background: voyageInput.trim() ? 'var(--color-primary)' : '#B0BEC5',
                color: 'white', fontWeight: 600, fontSize: 14,
                cursor: voyageInput.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {looking ? '...' : t('lookup')}
            </button>
          </div>
          {voyageError && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 6,
              background: '#FEF2F2', color: 'var(--color-danger)', fontSize: 13,
            }}>
              {voyageError}
            </div>
          )}
        </div>
      )}

      {/* ── ENTRY ── */}
      {phase === 'entry' && voyageInfo && (
        <>
          {/* Vessel header */}
          <div style={{
            background: 'white', borderRadius: 8,
            padding: '16px 24px', border: '1px solid var(--color-border)',
            marginBottom: 20, display: 'flex',
            justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                {t('voyage_number')}
              </div>
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-primary)', marginBottom: 10 }}>
                {voyageInfo.berthing.voyage_number}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 28px', fontSize: 13 }}>
                {[
                  [t('vessel_name'),    voyageInfo.berthing.vessel_name],
                  [t('shipping_agent'), voyageInfo.berthing.shipping_agent],
                  [t('ata'),            voyageInfo.berthing.ata?.slice(0, 16) || '—'],
                  [t('atd'),            voyageInfo.berthing.atd?.slice(0, 16) || '—'],
                ].map(([k, v]) => (
                  <span key={k}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{k}: </span>
                    <strong>{v}</strong>
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleChangeVoyage}
              style={{
                padding: '8px 16px', borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: 'white', cursor: 'pointer', fontSize: 13,
                flexShrink: 0,
              }}
            >
              {t('change_voyage')}
            </button>
          </div>

          {/* Add service line */}
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            border: '1px solid var(--color-border)', marginBottom: 20,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: 'var(--color-text)' }}>
              {t('add_service_line')}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '2.4fr 0.65fr 0.7fr 0.8fr 0.9fr auto',
              gap: 12, alignItems: 'end',
            }}>
              {/* Code */}
              <div>
                <label style={labelStyle}>{t('service_code')}</label>
                <GCCodeSelect
                  ref={codeInputRef}
                  codes={codes}
                  value={line.codeObj}
                  onChange={codeObj => setLine(prev => ({ ...prev, codeObj, rate: '' }))}
                />
              </div>

              {/* Unit — read-only */}
              <div>
                <label style={labelStyle}>{t('gc_unit')}</label>
                <div style={{
                  ...fieldStyle, display: 'flex', alignItems: 'center',
                  background: '#F8FAFF', color: 'var(--color-text-muted)',
                  fontSize: 13,
                }}>
                  {line.codeObj?.unit || '—'}
                </div>
              </div>

              {/* Qty */}
              <div>
                <label style={labelStyle}>{t('quantity')}</label>
                <input
                  type="number" min="0" step="any"
                  style={{ ...fieldStyle, width: '100%' }}
                  value={line.qty}
                  onChange={e => setLine(prev => ({ ...prev, qty: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddLine() }}
                />
              </div>

              {/* Rate */}
              <div>
                <label style={labelStyle}>{t('gc_rate')}</label>
                <input
                  type="number" step="any"
                  style={{ ...fieldStyle, width: '100%' }}
                  value={line.rate}
                  onChange={e => setLine(prev => ({ ...prev, rate: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddLine() }}
                />
              </div>

              {/* Line Total (read-only) */}
              <div>
                <label style={labelStyle}>{t('line_total')}</label>
                <div style={{
                  ...fieldStyle, display: 'flex', alignItems: 'center', gap: 6,
                  background: '#F8FAFF', color: 'var(--color-primary)', fontWeight: 700,
                }}>
                  <span className="num-ltr">
                    {lineTotal !== null ? fmt(lineTotal) : '—'}
                  </span>
                  {minimumApplied && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: 'var(--color-primary)', color: 'white',
                      borderRadius: 3, padding: '1px 5px', letterSpacing: '0.03em',
                    }}>
                      {t('gc_min_applied')}
                    </span>
                  )}
                </div>
              </div>

              {/* Add button */}
              <div>
                <label style={{ ...labelStyle, visibility: 'hidden' }}>.</label>
                <button
                  onClick={handleAddLine}
                  style={{
                    height: 44, padding: '0 20px', borderRadius: 6, border: 'none',
                    background: 'var(--color-primary)', color: 'white',
                    fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  + {t('add_line')}
                </button>
              </div>
            </div>

            {/* Inline error */}
            {lineError && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 6,
                background: '#FEF2F2', color: 'var(--color-danger)', fontSize: 13,
              }}>
                {lineError}
              </div>
            )}
          </div>

          {/* Pending lines */}
          {pendingLines.length > 0 && (
            <div style={{
              background: 'white', borderRadius: 8,
              border: '1px solid var(--color-border)', marginBottom: 20,
            }}>
              <div style={{
                padding: '14px 24px', borderBottom: '1px solid #F0F0F0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {t('pending_lines')} ({pendingLines.length})
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {t('subtotal')}:{' '}
                  <strong className="num-ltr" style={{ color: 'var(--color-primary)' }}>
                    {fmt(pendingSubtotal)}
                  </strong>
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFF' }}>
                    <th style={thStyle}>{t('service_code')}</th>
                    <th style={thStyle}>{t('gc_unit')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('quantity')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('gc_rate')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('gc_minimum')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('line_total')}</th>
                    <th style={{ ...thStyle, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLines.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F5F5F5', background: l._uncertain ? '#FFFBEB' : 'transparent' }}>
                      <td style={tdStyle}>
                        <strong>{l.service_code}</strong>
                        {' '}
                        <span style={{ color: 'var(--color-text-muted)' }}>{l.description}</span>
                        {l._uncertain && <span title={t('import_uncertain_tooltip')} style={{ color: '#F59E0B', marginInlineStart: 4 }}>⚠</span>}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{l.unit || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr">{l.quantity}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr">{fmt(l.rate)}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr" style={{ color: 'var(--color-text-muted)' }}>
                          {l.minimum > 0 ? fmt(l.minimum) : ''}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span className="num-ltr" style={{ fontWeight: 600 }}>{fmt(l.line_total)}</span>
                          {l.minimum_applied ? (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              background: 'var(--color-primary)', color: 'white',
                              borderRadius: 3, padding: '1px 5px',
                            }}>
                              {t('gc_min_applied')}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleRemovePending(i)}
                          style={{
                            background: 'none', border: 'none',
                            color: 'var(--color-danger)', cursor: 'pointer',
                            fontSize: 18, padding: '0 4px', lineHeight: 1,
                          }}
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleSaveSession}
                  disabled={saving}
                  style={{
                    padding: '12px 28px', borderRadius: 6, border: 'none',
                    background: saving ? '#B0BEC5' : 'var(--color-primary)',
                    color: 'white', fontWeight: 600, fontSize: 14,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '...' : t('save_session')}
                </button>
              </div>
            </div>
          )}

          {/* Saved lines from DB */}
          {savedLines.length > 0 && (
            <div style={{
              background: 'white', borderRadius: 8,
              border: '1px solid var(--color-border)',
            }}>
              <div style={{ padding: '14px 24px', borderBottom: '1px solid #F0F0F0' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t('saved_lines')}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFF' }}>
                    <th style={thStyle}>{t('service_code')}</th>
                    <th style={thStyle}>{t('gc_unit')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('quantity')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('gc_rate')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('gc_minimum')}</th>
                    <th style={{ ...thStyle, textAlign: 'end' }}>{t('line_total')}</th>
                    <th style={{ ...thStyle, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {userSavedLines.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #F5F5F5' }}>
                      <td style={tdStyle}>
                        <strong>{l.service_code}</strong>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{l.unit || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr">{l.quantity}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr">{fmt(l.rate)}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr" style={{ color: 'var(--color-text-muted)' }}>
                          {l.minimum > 0 ? fmt(l.minimum) : ''}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span className="num-ltr" style={{ fontWeight: 600 }}>{fmt(l.line_total)}</span>
                          {l.minimum_applied ? (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              background: 'var(--color-primary)', color: 'white',
                              borderRadius: 3, padding: '1px 5px',
                            }}>
                              {t('gc_min_applied')}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteSaved(l.id)}
                          style={{
                            background: 'none', border: 'none',
                            color: 'var(--color-danger)', cursor: 'pointer',
                            fontSize: 18, padding: '0 4px', lineHeight: 1,
                          }}
                        >×</button>
                      </td>
                    </tr>
                  ))}

                  {systemSavedLines.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={7} style={{
                          padding: '7px 16px', background: '#F5F5F5',
                          fontSize: 11, color: 'var(--color-text-muted)',
                          fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>
                          {t('system_lines')}
                        </td>
                      </tr>
                      {systemSavedLines.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid #F5F5F5', opacity: 0.65 }}>
                          <td style={tdStyle}>
                            <strong>{l.service_code}</strong>
                          </td>
                          <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{l.unit || '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'end' }}>
                            <span className="num-ltr">{l.quantity}</span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'end' }}>
                            <span className="num-ltr">{fmt(l.rate)}</span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'end' }}></td>
                          <td style={{ ...tdStyle, textAlign: 'end' }}>
                            <span className="num-ltr" style={{ fontWeight: 600 }}>{fmt(l.line_total)}</span>
                          </td>
                          <td style={tdStyle}></td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
              <div style={{
                padding: '12px 24px', borderTop: '1px solid #F0F0F0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <button
                  onClick={() => onGenerateReceipt?.(voyageInfo.berthing.voyage_number)}
                  style={{
                    padding: '10px 22px', borderRadius: 6, border: 'none',
                    background: '#1B2A4A', color: 'white',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  🧾 {t('generate_receipt')}
                </button>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-primary)' }}>
                  {t('total_fee')}:{' '}
                  <span className="num-ltr">{fmt(savedTotal)}</span>
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Save session confirmation modal */}
      {showSaveConfirm && voyageInfo && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, width: 400,
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '28px 28px 0' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>
                {t('confirm_save_session')}
              </h3>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                {[
                  [t('voyage_number'), voyageInfo.berthing.voyage_number],
                  [t('vessel_name'),   voyageInfo.berthing.vessel_name],
                  [t('pending_lines'), String(pendingLines.length)],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '5px 0', borderBottom: '1px solid #F0F0F0',
                  }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', marginBottom: 8,
                background: '#F8FAFF', borderRadius: 8, border: '1px solid var(--color-border)',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 14 }}>
                  {t('subtotal')}
                </span>
                <span className="num-ltr" style={{ fontWeight: 700, fontSize: 20, color: 'var(--color-primary)' }}>
                  {fmt(pendingSubtotal)}
                </span>
              </div>
            </div>
            <div style={{
              padding: '16px 28px 24px',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              borderTop: '1px solid #F0F0F0',
            }}>
              <button
                onClick={() => setShowSaveConfirm(false)}
                style={{
                  padding: '10px 20px', borderRadius: 6, fontSize: 14,
                  border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer',
                }}
              >
                {t('go_back')}
              </button>
              <button
                onClick={doConfirmSave}
                style={{
                  padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 14,
                  background: 'var(--color-primary)', color: 'white',
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('confirm_save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
