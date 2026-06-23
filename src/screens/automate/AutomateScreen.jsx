import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import SearchableSelect from '../../components/SearchableSelect.jsx'
import BatchImport from './BatchImport.jsx'
import { COUNTRIES } from '../../data/countries.js'
import ReceiptPreview from '../receipt/ReceiptPreview.jsx'
import {
  POSITIONS, computeBreakdowns,
  validateReviewData, insertVoyage, autoSaveReceipt,
} from '../../logic/automateImport.js'

function ImagePreviewModal({ images, onClose }) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1.0)
  const [pos, setPos] = useState({ x: Math.max(0, window.innerWidth / 2 - 340), y: 60 })
  const dragRef = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 })

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex(i => Math.min(images.length - 1, i + 1))
    }
    function onMove(e) {
      if (!dragRef.current.active) return
      setPos({ x: e.clientX - dragRef.current.startX + dragRef.current.origX, y: e.clientY - dragRef.current.startY + dragRef.current.origY })
    }
    function onUp() { dragRef.current.active = false }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [images.length, onClose])

  function startDrag(e) {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
  }

  const MODAL_W = 680
  const btnStyle = { padding: '3px 10px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: 14 }

  return (
    <div style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 99997, background: 'white', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.3)', border: '1px solid var(--color-border)', width: MODAL_W, userSelect: 'none' }}>
      <div onMouseDown={startDrag} style={{ padding: '10px 16px', borderBottom: '1px solid #F0F0F0', cursor: 'move', display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFF', borderRadius: '10px 10px 0 0' }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
          👁 {images.length > 1 ? `Image ${index + 1} / ${images.length}` : 'Preview'}
        </span>
        <button onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))} style={btnStyle}>−</button>
        <span className="num-ltr" style={{ fontSize: 12, minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, Math.round((z + 0.25) * 100) / 100))} style={btnStyle}>+</button>
        <button onClick={onClose} style={{ ...btnStyle, marginInlineStart: 4, color: 'var(--color-text-muted)' }}>✕</button>
      </div>
      <div style={{ overflow: 'auto', maxHeight: 'calc(80vh - 50px)', background: '#F5F5F5' }}>
        <img
          src={`data:${images[index].mediaType};base64,${images[index].data}`}
          alt=""
          style={{ width: MODAL_W * zoom, maxWidth: 'none', display: 'block' }}
        />
      </div>
      {images.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: '10px 16px', borderTop: '1px solid #F0F0F0' }}>
          <button disabled={index === 0} onClick={() => setIndex(i => i - 1)}
            style={{ ...btnStyle, opacity: index === 0 ? 0.4 : 1, cursor: index === 0 ? 'not-allowed' : 'pointer' }}>
            ‹ Prev
          </button>
          <span className="num-ltr" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{index + 1} / {images.length}</span>
          <button disabled={index === images.length - 1} onClick={() => setIndex(i => i + 1)}
            style={{ ...btnStyle, opacity: index === images.length - 1 ? 0.4 : 1, cursor: index === images.length - 1 ? 'not-allowed' : 'pointer' }}>
            Next ›
          </button>
        </div>
      )}
    </div>
  )
}

function buildPdfPath(voyageNumber, vesselName) {
  const sanitize = s => String(s || '').replace(/[^a-zA-Z0-9-_]/g, '_').replace(/_+/g, '_').slice(0, 40)
  const today = new Date().toISOString().split('T')[0]
  return `C:\\ShipFees\\receipts\\${sanitize(voyageNumber)}_${sanitize(vesselName)}_${today}.pdf`
}
const VESSEL_CATEGORIES = [
  'Lebanese', 'Wooden Coasters', 'Sailboats', 'Passenger', 'Tourist',
  'Ro-Ro', 'Military', 'Lebanese Government (Non-Commercial)',
]
const VESSEL_TYPES = ['Container', 'General Cargo', 'RoRo', 'Petrolien']

function normalizeVesselType(type) {
  if (!type) return type
  if (type.toLowerCase().replace(/[-\s]/g, '') === 'roro') return 'Container'
  return type
}

const EMPTY_FORM = {
  voyageNumber: '', vesselName: '', vesselType: '',
  flag: '', shippingAgent: '', ata: '', atd: '',
  loa: '', vesselCategory: '', maintenance: 'No',
}
const EMPTY_ROW = { position: '', days: '' }

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const thStyle = {
  padding: '9px 14px', textAlign: 'start', fontWeight: 600,
  fontSize: 12, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.03em',
}
const tdStyle = { padding: '9px 14px', verticalAlign: 'middle', fontSize: 13 }

export default function AutomateScreen({ onGenerateReceipt }) {
  const { t } = useTranslation()
  const { session, ratesData, agents } = useSession()

  const [phase, setPhase]               = useState('batch')
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [berthingRows, setBerthingRows] = useState([{ ...EMPTY_ROW }])
  const [breakdowns, setBreakdowns]     = useState([null])
  const [uncertainFields, setUncertainFields] = useState(new Set())
  const [serviceLines, setServiceLines] = useState([])
  const [containerCodes, setContainerCodes] = useState([])
  const [gcCodes, setGcCodes]           = useState([])
  const [errors, setErrors]             = useState({})
  const [saving, setSaving]             = useState(false)
  const [toast, setToast]               = useState(null)
  const [doneInfo, setDoneInfo]         = useState(null)
  const [donePdf, setDonePdf]           = useState(null) // { path, error, skipped }
  const [pdfExportItem, setPdfExportItem] = useState(null)
  const pdfResolveRef = useRef(null)
  const [manualLines, setManualLines]   = useState([])
  const [reviewImages, setReviewImages] = useState([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  // Batch import state — BatchImport stays mounted (hidden) while one of its
  // groups is open in the review phase, so the queue state survives the handoff
  const [batchReviewGroupId, setBatchReviewGroupId] = useState(null)
  const batchRef = useRef(null)

  useEffect(() => {
    window.api.containerGetCodes().then(r => { if (r.success) setContainerCodes(r.data) })
    window.api.gcGetCodes().then(r => { if (r.success) setGcCodes(r.data) })
  }, [])

  // Focus first uncertain field after scan populates the review form
  useEffect(() => {
    if (phase !== 'review') return
    const id = setTimeout(() => {
      const firstUncertain = document.querySelector('.field-uncertain')
      if (firstUncertain) {
        firstUncertain.focus()
        firstUncertain.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 50)
    return () => clearTimeout(id)
  }, [phase])

  // Live fee calc — one breakdown per berthing row
  useEffect(() => {
    if (!ratesData) return
    setBreakdowns(computeBreakdowns(berthingRows, form, ratesData))
  }, [berthingRows, form.loa, form.vesselCategory, form.maintenance, ratesData])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  function setRow(i, field, value) {
    setBerthingRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addRow() {
    setBerthingRows(prev => [...prev, { ...EMPTY_ROW }])
    setBreakdowns(prev => [...prev, null])
  }
  function removeRow(i) {
    setBerthingRows(prev => prev.filter((_, idx) => idx !== i))
    setBreakdowns(prev => prev.filter((_, idx) => idx !== i))
  }

  function clearUncertain(field) {
    setUncertainFields(prev => {
      if (!prev.has(field)) return prev
      const next = new Set(prev); next.delete(field); return next
    })
  }
  const uf = (field) => ({ onFocus: () => clearUncertain(field), onClick: () => clearUncertain(field) })

  async function handleInsertAll() {
    const { errors: e, validRows } = validateReviewData(form, berthingRows, breakdowns)
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSaving(true)
    try {
      const result = await insertVoyage({ form, validRows, serviceLines, manualLines, userId: session.id })

      if (batchReviewGroupId) {
        // Group came from Batch Import — mark it inserted and return to the batch summary
        batchRef.current?.resolveGroup(batchReviewGroupId, result)
        setBatchReviewGroupId(null)
        setPhase('batch')
      } else {
        setDoneInfo(result)
        setPhase('done')
        // Auto-generate receipt + PDF
        const receiptResult = await autoSaveReceipt(result.voyageNumber, session.username)
        if (!receiptResult.success) {
          setDonePdf({ skipped: receiptResult.skip || false, error: receiptResult.error || null })
        } else {
          const filePath = buildPdfPath(result.voyageNumber, receiptResult.rawData.header.vessel_name)
          const pdfResult = await new Promise(resolve => {
            pdfResolveRef.current = resolve
            setPdfExportItem({ voyageNumber: result.voyageNumber, filePath })
          })
          setPdfExportItem(null)
          setDonePdf({ path: pdfResult.error ? null : (pdfResult.path || null), error: pdfResult.error || null })
        }
      }
    } catch (err) {
      showToast(err.message || 'Error', 'error')
    } finally {
      setSaving(false)
    }
  }


  function handleStartOver() {
    setPhase('batch')
    setForm(EMPTY_FORM)
    setBerthingRows([{ ...EMPTY_ROW }])
    setBreakdowns([null])
    setServiceLines([])
    setManualLines([])
    setUncertainFields(new Set())
    setErrors({})
    setDoneInfo(null)
    setDonePdf(null)
    setPdfExportItem(null)
    setBatchReviewGroupId(null)
    setReviewImages([])
    setShowPreviewModal(false)
  }

  // A batch group held in "Needs Review" opens in the regular review phase
  function openBatchGroupReview(group) {
    if (!group?.review) return
    setBatchReviewGroupId(group.id)
    setForm(group.review.form)
    setBerthingRows(group.review.berthingRows)
    setBreakdowns(group.review.berthingRows.map(() => null))
    setServiceLines(group.review.serviceLines)
    setManualLines([])
    setUncertainFields(new Set(group.review.uncertainFields))
    setErrors({})
    setReviewImages(group.pages ? group.pages.flatMap(p => p.images) : [])
    setShowPreviewModal(false)
    setPhase('review')
  }

  function backToBatch() {
    setBatchReviewGroupId(null)
    setReviewImages([])
    setShowPreviewModal(false)
    setPhase('batch')
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function addManualLine() {
    const blank = isContainerSession
      ? { _type: 'container', _manual: true, service_code: '', container_type: '20ft', quantity: 1, price_per_unit: 0, line_total: 0, is_taxable: 0, description: '' }
      : { _type: 'gc', _manual: true, service_code: '', quantity: 1, rate: 0, minimum: 0, line_total: 0, is_taxable: 0, description: '', unit: '' }
    setManualLines(prev => [...prev, blank])
  }

  function updateManualLine(i, updates) {
    setManualLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const u = { ...l, ...updates }
      if (u._type === 'container') {
        u.line_total = Number(u.quantity) * Number(u.price_per_unit)
      } else {
        const raw = Number(u.quantity) * Number(u.rate)
        u.line_total = u.minimum > 0 ? Math.max(raw, u.minimum) : raw
      }
      return u
    }))
  }

  function removeManualLine(i) {
    setManualLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateServiceLine(i, updates) {
    setServiceLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const u = { ...l, ...updates }
      if (u._type === 'container') {
        u.line_total = Number(u.quantity) * Number(u.price_per_unit)
      } else {
        const raw = Number(u.quantity) * Number(u.rate)
        u.line_total = u.minimum > 0 ? Math.max(raw, u.minimum) : raw
      }
      return u
    }))
  }

  const fieldStyle = (err, unc) => ({
    width: '100%', height: 44, padding: '0 12px',
    border: `1px solid ${err ? 'var(--color-danger)' : unc ? '#F59E0B' : 'var(--color-border)'}`,
    borderRadius: 6, fontSize: 14, outline: 'none',
    background: unc ? '#FFFBEB' : 'white',
    boxSizing: 'border-box',
  })
  const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }
  const groupStyle = { marginBottom: 16 }
  const twoCol     = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

  const UncWarn = ({ field }) => uncertainFields.has(field)
    ? <span title={t('uncertain_reason_model')} style={{ color: '#F59E0B', marginInlineStart: 5, fontSize: 13 }}>⚠</span>
    : null

  function serviceUncertainHint(line) {
    if (!line._uncertain) return null
    const key = line._uncertainReason === 'unknown_code' ? 'uncertain_reason_unknown_code'
      : line._uncertainReason === 'missing_ctype' ? 'uncertain_reason_missing_ctype'
      : 'uncertain_reason_model'
    return t(key)
  }

  // Only show the blocking banner when there are actually visible amber indicators
  const FORM_UNCERTAIN_KEYS = new Set(['voyage_number','vessel_name','vessel_type','flag','shipping_agent','ata','atd','loa'])
  const hasVisibleUncertain = (
    [...uncertainFields].some(f => FORM_UNCERTAIN_KEYS.has(f)) ||
    serviceLines.some(l => l._uncertain)
  )

  const ataDate = form.ata ? form.ata.split('T')[0] : ''
  const ataTime = form.ata ? (form.ata.split('T')[1] || '').slice(0, 5) : ''
  const atdDate = form.atd ? form.atd.split('T')[0] : ''
  const atdTime = form.atd ? (form.atd.split('T')[1] || '').slice(0, 5) : ''

  const sessionType        = serviceLines.length > 0 ? serviceLines[0]._type : (normalizeVesselType(form.vesselType) === 'Container' ? 'container' : 'gc')
  const isContainerSession = sessionType === 'container'
  const hasAnyBreakdown    = breakdowns.some(Boolean)
  const totalBerthingFee   = breakdowns.reduce((sum, bd) => sum + (bd?.finalFee || 0), 0)

  return (
    <div className="app-screen" style={{ padding: 28, maxWidth: 960 }}>

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
        🤖 {t('automate')}
      </h2>

      {/* ── BATCH IMPORT ── always mounted; hidden while a group is open in review */}
      <div style={{ display: phase === 'batch' ? 'block' : 'none' }}>
        <BatchImport
          ref={batchRef}
          containerCodes={containerCodes}
          gcCodes={gcCodes}
          onExit={handleStartOver}
          onReviewGroup={openBatchGroupReview}
          onViewReceipt={onGenerateReceipt}
        />
      </div>

      {/* ── REVIEW ── */}
      {phase === 'review' && (
        <>
          {/* Preview modal */}
          {showPreviewModal && reviewImages.length > 0 && (
            <ImagePreviewModal images={reviewImages} onClose={() => setShowPreviewModal(false)} />
          )}

          {/* Preview button strip */}
          {reviewImages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button
                onClick={() => setShowPreviewModal(v => !v)}
                style={{
                  padding: '7px 18px', borderRadius: 6, border: '1px solid var(--color-border)',
                  background: showPreviewModal ? 'var(--color-primary)' : 'white',
                  color: showPreviewModal ? 'white' : 'var(--color-text)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                👁 {t('preview')} {reviewImages.length > 1 ? `(${reviewImages.length})` : ''}
              </button>
            </div>
          )}

          {/* Berthing card */}
          <div style={{ background: 'white', borderRadius: 8, padding: 24, border: '1px solid var(--color-border)', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: 'var(--color-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚓ {t('berthing')}</span>
              {hasVisibleUncertain && (
                <span style={{ fontSize: 12, color: '#D97706', fontWeight: 500 }}>
                  ⚠ {t('import_uncertain_fields_blocking')}
                </span>
              )}
            </div>

            <div style={groupStyle}>
              <label style={labelStyle}>{t('voyage_number')} * <UncWarn field="voyage_number" /></label>
              <input
                className={uncertainFields.has('voyage_number') ? 'field-uncertain' : undefined}
                style={fieldStyle(errors.voyageNumber, uncertainFields.has('voyage_number'))} type="text"
                value={form.voyageNumber} onChange={e => set('voyageNumber', e.target.value)} {...uf('voyage_number')} />
            </div>

            <div style={twoCol}>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('vessel_name')} * <UncWarn field="vessel_name" /></label>
                <input
                  className={uncertainFields.has('vessel_name') ? 'field-uncertain' : undefined}
                  style={fieldStyle(errors.vesselName, uncertainFields.has('vessel_name'))} type="text"
                  value={form.vesselName} onChange={e => set('vesselName', e.target.value)} {...uf('vessel_name')} />
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('vessel_type')} <UncWarn field="vessel_type" /></label>
                <select
                  className={uncertainFields.has('vessel_type') ? 'field-uncertain' : undefined}
                  style={{ ...fieldStyle(false, uncertainFields.has('vessel_type')), cursor: 'pointer' }}
                  value={form.vesselType} onChange={e => set('vesselType', e.target.value)} {...uf('vessel_type')}>
                  <option value="">—</option>
                  {VESSEL_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}
                </select>
              </div>
            </div>

            <div style={twoCol}>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('flag')} <UncWarn field="flag" /></label>
                <div style={{ outline: uncertainFields.has('flag') ? '1px solid #F59E0B' : 'none', borderRadius: 6, background: uncertainFields.has('flag') ? '#FFFBEB' : 'transparent' }} {...uf('flag')}>
                  <SearchableSelect options={COUNTRIES} value={form.flag} onChange={v => { set('flag', v); clearUncertain('flag') }} />
                </div>
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('shipping_agent')} * <UncWarn field="shipping_agent" /></label>
                <div style={{
                  outline: errors.shippingAgent ? '2px solid var(--color-danger)' : uncertainFields.has('shipping_agent') ? '1px solid #F59E0B' : 'none',
                  borderRadius: 6, background: uncertainFields.has('shipping_agent') ? '#FFFBEB' : 'transparent',
                }} {...uf('shipping_agent')}>
                  <SearchableSelect options={agents} value={form.shippingAgent} onChange={v => { set('shippingAgent', v); clearUncertain('shipping_agent') }} />
                </div>
              </div>
            </div>

            <div style={twoCol}>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('ata')} * <UncWarn field="ata" /></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="date" value={ataDate}
                    onChange={e => set('ata', e.target.value + 'T' + (ataTime || '00:00'))}
                    className={uncertainFields.has('ata') ? 'field-uncertain' : undefined}
                    style={{ ...fieldStyle(errors.ata, uncertainFields.has('ata')), flex: '1.5 1 0' }}
                    {...uf('ata')} />
                  <input type="time" value={ataTime}
                    onChange={e => { if (ataDate) set('ata', ataDate + 'T' + e.target.value) }}
                    style={{ ...fieldStyle(errors.ata, uncertainFields.has('ata')), flex: '1 1 0' }}
                    {...uf('ata')} />
                </div>
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('atd')} * <UncWarn field="atd" /></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="date" value={atdDate}
                    onChange={e => set('atd', e.target.value + 'T' + (atdTime || '00:00'))}
                    style={{ ...fieldStyle(errors.atd, uncertainFields.has('atd')), flex: '1.5 1 0' }}
                    {...uf('atd')} />
                  <input type="time" value={atdTime}
                    onChange={e => { if (atdDate) set('atd', atdDate + 'T' + e.target.value) }}
                    style={{ ...fieldStyle(errors.atd, uncertainFields.has('atd')), flex: '1 1 0' }}
                    {...uf('atd')} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('loa')} * <UncWarn field="loa" /></label>
                <input
                  className={uncertainFields.has('loa') ? 'field-uncertain' : undefined}
                  style={fieldStyle(errors.loa, uncertainFields.has('loa'))} type="number" min="0" step="0.01"
                  value={form.loa} onChange={e => set('loa', e.target.value)} {...uf('loa')} />
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('vessel_category')}</label>
                <select style={{ ...fieldStyle(false), cursor: 'pointer' }}
                  value={form.vesselCategory} onChange={e => set('vesselCategory', e.target.value)}>
                  <option value="">{t('none')}</option>
                  {VESSEL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>{t('maintenance')}</label>
                <select style={{ ...fieldStyle(false), cursor: 'pointer' }}
                  value={form.maintenance} onChange={e => set('maintenance', e.target.value)}>
                  <option value="No">{t('no')}</option>
                  <option value="Yes">{t('yes')}</option>
                </select>
              </div>
            </div>

            {/* Berthing positions table */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 8 }}>
                {t('position')} / {t('days')} *
              </label>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                border: errors.berthing ? '1px solid var(--color-danger)' : '1px solid var(--color-border)',
                borderRadius: 6, overflow: 'hidden',
              }}>
                <thead>
                  <tr style={{ background: '#F8FAFF' }}>
                    <th style={{ ...thStyle, width: '45%' }}>{t('position')}</th>
                    <th style={{ ...thStyle, width: '20%' }}>{t('days')}</th>
                    <th style={{ ...thStyle, textAlign: 'end', width: '30%' }}>{t('total_fee')}</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {berthingRows.map((row, i) => (
                    <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F0F0' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <select
                          style={{ ...fieldStyle(false), height: 36 }}
                          value={row.position}
                          onChange={e => setRow(i, 'position', e.target.value)}>
                          <option value="">{t('select_placeholder')}</option>
                          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <input
                          type="number" min="1" step="1"
                          style={{ ...fieldStyle(false), height: 36 }}
                          value={row.days}
                          onChange={e => setRow(i, 'days', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'end', fontWeight: 600, fontSize: 13, color: breakdowns[i] ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                        <span className="num-ltr">{breakdowns[i] ? fmt(breakdowns[i].finalFee) : '—'}</span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {berthingRows.length > 1 && (
                          <button onClick={() => removeRow(i)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {berthingRows.length > 1 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--color-border)', background: '#F8FAFF' }}>
                      <td colSpan={2} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        {t('berthing_total')}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'end', fontWeight: 700, fontSize: 14, color: 'var(--color-primary)' }}>
                        <span className="num-ltr">{fmt(totalBerthingFee)}</span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              <button
                type="button"
                onClick={addRow}
                style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, border: '1px dashed var(--color-border)', background: 'white', fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                + Add Row
              </button>
            </div>

            {Object.keys(errors).length > 0 && (
              <div style={{ padding: '10px 14px', borderRadius: 6, background: '#FEF2F2', color: 'var(--color-danger)', fontSize: 13, marginTop: 12 }}>
                {t('required_fields_missing')}
              </div>
            )}
          </div>

          {/* Service lines card */}
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 20 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F0F0', fontWeight: 700, fontSize: 15 }}>
              📋 {t('services_section')} ({serviceLines.length + manualLines.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFF' }}>
                  <th style={thStyle}>{t('service_code')}</th>
                  {isContainerSession && <th style={thStyle}>{t('container_type')}</th>}
                  <th style={{ ...thStyle, textAlign: 'end' }}>{t('quantity')}</th>
                  <th style={{ ...thStyle, textAlign: 'end' }}>{t('price_per_unit')}</th>
                  <th style={{ ...thStyle, textAlign: 'end' }}>{t('line_total')}</th>
                  <th style={{ ...thStyle, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {serviceLines.map((l, i) => {
                  const inpStyle = { height: 30, padding: '0 6px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12, outline: 'none', background: 'white', textAlign: 'end' }
                  const codeListId = `code-sl-${i}`
                  function applyServiceCode(code) {
                    const upper = code.toUpperCase().trim()
                    const mc = (isContainerSession ? containerCodes : gcCodes).find(c => c.code.toUpperCase() === upper)
                    if (!mc) { updateServiceLine(i, { service_code: code.trim() }); return }
                    if (isContainerSession) {
                      const rate = l.container_type === '40ft' && mc.default_rate_40 != null ? mc.default_rate_40 : (mc.default_rate_20 ?? 0)
                      updateServiceLine(i, { service_code: mc.code, description: mc.description || '', is_taxable: mc.is_taxable || 0, price_per_unit: rate })
                    } else {
                      updateServiceLine(i, { service_code: mc.code, description: mc.description || '', unit: mc.unit || '', is_taxable: mc.is_taxable || 0, rate: mc.rate ?? l.rate, minimum: mc.minimum ?? 0 })
                    }
                  }
                  return (
                  <tr key={`p${i}`} style={{ borderBottom: '1px solid #F5F5F5', background: l._uncertain ? '#FFFBEB' : 'transparent' }}>
                    <td style={{ ...tdStyle, paddingTop: 5, paddingBottom: 5, minWidth: 180 }}>
                      <datalist id={codeListId}>
                        {(isContainerSession ? containerCodes : gcCodes).map(c => <option key={c.code} value={c.code} />)}
                      </datalist>
                      <input
                        type="text"
                        list={codeListId}
                        value={l.service_code}
                        onChange={e => updateServiceLine(i, { service_code: e.target.value })}
                        onBlur={e => applyServiceCode(e.target.value)}
                        onFocus={() => l._uncertain && updateServiceLine(i, { _uncertain: false, _uncertainReason: null })}
                        style={{ ...inpStyle, width: '100%', textAlign: 'start', textTransform: 'uppercase' }}
                      />
                      {l._uncertain && <div style={{ fontSize: 11, color: '#D97706', marginTop: 2, paddingInlineStart: 2 }}>⚠ {serviceUncertainHint(l)}</div>}
                    </td>
                    {isContainerSession && <td style={tdStyle}>{l.container_type}</td>}
                    <td style={{ ...tdStyle, textAlign: 'end', paddingTop: 5, paddingBottom: 5 }}>
                      <input
                        type="number" min="1" step="1"
                        value={l.quantity}
                        onChange={e => updateServiceLine(i, { quantity: Number(e.target.value) })}
                        onFocus={e => e.target.select()}
                        className="num-ltr"
                        style={{ ...inpStyle, width: 70 }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'end', paddingTop: 5, paddingBottom: 5 }}>
                      <input
                        type="number" step="0.01" min="0"
                        value={l._type === 'container' ? l.price_per_unit : l.rate}
                        onChange={e => updateServiceLine(i, { [l._type === 'container' ? 'price_per_unit' : 'rate']: Number(e.target.value) })}
                        onFocus={e => e.target.select()}
                        className="num-ltr"
                        style={{ ...inpStyle, width: 90 }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'end' }}>
                      <span className="num-ltr" style={{ fontWeight: 600 }}>{fmt(l.line_total)}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {l._uncertain && (
                        <button
                          onClick={() => updateServiceLine(i, { _uncertain: false, _uncertainReason: null })}
                          title={t('batch_accept_ai')}
                          style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1, fontWeight: 700 }}
                        >✓</button>
                      )}
                      <button
                        onClick={() => setServiceLines(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
                      >×</button>
                    </td>
                  </tr>
                  )
                })}
                {manualLines.map((l, i) => {
                  const inpStyle = { height: 30, padding: '0 6px', border: '1px solid #BFDBFE', borderRadius: 4, fontSize: 12, outline: 'none', background: 'white' }
                  const codeList = (isContainerSession ? containerCodes : gcCodes).map(c => c.code)
                  const listId = `code-list-${i}`
                  function applyCode(code) {
                    const upper = code.toUpperCase().trim()
                    const mc = (isContainerSession ? containerCodes : gcCodes).find(c => c.code.toUpperCase() === upper)
                    if (isContainerSession) {
                      const rate = l.container_type === '40ft' && mc?.default_rate_40 != null ? mc.default_rate_40 : (mc?.default_rate_20 ?? (mc ? 0 : l.price_per_unit))
                      updateManualLine(i, { service_code: mc?.code || code.trim(), description: mc?.description || '', is_taxable: mc?.is_taxable || 0, price_per_unit: rate })
                    } else {
                      const rate = mc?.rate ?? l.rate; const min = mc?.minimum ?? 0
                      updateManualLine(i, { service_code: mc?.code || code.trim(), description: mc?.description || '', unit: mc?.unit || '', is_taxable: mc?.is_taxable || 0, rate, minimum: min })
                    }
                  }
                  return (
                    <tr key={`m${i}`} style={{ borderBottom: '1px solid #DBEAFE', background: '#EFF6FF' }}>
                      <td style={{ ...tdStyle, paddingTop: 5, paddingBottom: 5, minWidth: 180 }}>
                        <datalist id={listId}>
                          {codeList.map(c => <option key={c} value={c} />)}
                        </datalist>
                        <input
                          type="text"
                          list={listId}
                          value={l.service_code}
                          placeholder="Code"
                          onChange={e => updateManualLine(i, { service_code: e.target.value })}
                          onBlur={e => applyCode(e.target.value)}
                          style={{ ...inpStyle, width: '100%', textTransform: 'uppercase' }}
                        />
                      </td>
                      {isContainerSession && (
                        <td style={{ ...tdStyle, paddingTop: 5, paddingBottom: 5 }}>
                          <select
                            value={l.container_type}
                            onChange={e => {
                              const ctype = e.target.value
                              const mc = containerCodes.find(c => c.code === l.service_code)
                              const rate = ctype === '40ft' && mc?.default_rate_40 != null ? mc.default_rate_40 : (mc?.default_rate_20 ?? l.price_per_unit)
                              updateManualLine(i, { container_type: ctype, price_per_unit: rate })
                            }}
                            style={{ ...inpStyle, width: 68 }}>
                            <option value="20ft">20ft</option>
                            <option value="40ft">40ft</option>
                          </select>
                        </td>
                      )}
                      <td style={{ ...tdStyle, textAlign: 'end', paddingTop: 5, paddingBottom: 5 }}>
                        <input type="number" min="1" step="1" value={l.quantity}
                          onChange={e => updateManualLine(i, { quantity: Number(e.target.value) })}
                          style={{ ...inpStyle, width: 70, textAlign: 'end' }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end', paddingTop: 5, paddingBottom: 5 }}>
                        <input type="number" step="0.01" value={isContainerSession ? l.price_per_unit : l.rate}
                          onChange={e => updateManualLine(i, { [isContainerSession ? 'price_per_unit' : 'rate']: Number(e.target.value) })}
                          onFocus={e => e.target.select()}
                          style={{ ...inpStyle, width: 90, textAlign: 'end' }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end', fontWeight: 600 }}>
                        <span className="num-ltr">{fmt(l.line_total)}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button onClick={() => removeManualLine(i)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #F0F0F0' }}>
              <button onClick={addManualLine}
                style={{ padding: '5px 14px', borderRadius: 6, border: '1px dashed #93C5FD', background: '#EFF6FF', fontSize: 12, color: '#2563EB', cursor: 'pointer', fontWeight: 500 }}>
                + {t('add_line')}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleInsertAll}
              disabled={saving || !hasAnyBreakdown}
              style={{
                padding: '12px 32px', borderRadius: 6, border: 'none',
                background: !hasAnyBreakdown || saving ? '#B0BEC5' : 'var(--color-primary)',
                color: 'white', fontSize: 14, fontWeight: 700,
                cursor: !hasAnyBreakdown || saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '...' : t('automate_insert_all')}
            </button>
            <button
              onClick={batchReviewGroupId ? backToBatch : handleStartOver}
              style={{ padding: '12px 24px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 14, cursor: 'pointer' }}
            >
              {batchReviewGroupId ? t('batch_back_to_batch') : t('automate_start_over')}
            </button>
          </div>
        </>
      )}

      {/* ── DONE ── */}
      {phase === 'done' && doneInfo && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: '52px 72px',
            border: '1px solid var(--color-border)', textAlign: 'center', maxWidth: 460,
          }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{t('automate_done')}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 28, lineHeight: 2 }}>
              <div style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: 15 }}>{doneInfo.voyageNumber}</div>
              <div>{t('automate_berthing_saved')} — <span className="num-ltr">{fmt(doneInfo.berthingFee)}</span></div>
              {doneInfo.servicesSaved > 0 && <div>{doneInfo.servicesSaved} {t('automate_services_saved')}</div>}
              {/* PDF status */}
              {!donePdf && (
                <div style={{ marginTop: 8, color: 'var(--color-text-muted)' }}>🔄 {t('loading')}…</div>
              )}
              {donePdf?.path && (
                <div style={{ marginTop: 8, color: '#27ae60', fontSize: 12 }}>📄 {t('batch_pdf_saved')} — {donePdf.path}</div>
              )}
              {donePdf?.error && !donePdf?.skipped && (
                <div style={{ marginTop: 8, color: 'var(--color-danger)', fontSize: 12 }}>{t('batch_pdf_failed')}</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              {/* View receipt if saved, or generate if skipped/failed */}
              {donePdf && donePdf.path && (
                <button
                  onClick={() => onGenerateReceipt(doneInfo.voyageNumber)}
                  style={{ width: '100%', padding: '13px 0', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
                >
                  🧾 {t('view_receipt')}
                </button>
              )}
              {donePdf && !donePdf.path && (
                <button
                  onClick={() => onGenerateReceipt(doneInfo.voyageNumber)}
                  style={{ width: '100%', padding: '13px 0', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
                >
                  🧾 {t('generate_receipt')}
                </button>
              )}
              <button
                onClick={handleStartOver}
                style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                {t('automate_new_automation')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Silent PDF export overlay for single automate flow */}
      {pdfExportItem && (
        <ReceiptPreview
          voyageNumber={pdfExportItem.voyageNumber}
          readOnly={true}
          autoExportPath={pdfExportItem.filePath}
          onAutoExportDone={(error, path) => {
            if (pdfResolveRef.current) {
              pdfResolveRef.current({ error, path })
              pdfResolveRef.current = null
            }
          }}
          onClose={() => {}}
        />
      )}
    </div>
  )
}
