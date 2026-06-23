import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import { compressToJpeg, pdfToImages, pdfToImagesFromBase64 } from '../../components/DocumentImport.jsx'
import {
  parseFilenameTimestamp, nextId, buildGroups,
  movePage, splitPage, movePageToNewGroup,
} from '../../logic/batchGrouping.js'
import {
  buildReviewState, computeBreakdowns, validateReviewData,
  insertVoyage, autoSaveReceipt, EXTRACT_ERROR_KEYS,
} from '../../logic/automateImport.js'
import ReceiptPreview from '../receipt/ReceiptPreview.jsx'

const MAX_BYTES = 8 * 1024 * 1024

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtClock(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false })
}
function fmtDate(ts) {
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

const STATUS_STYLE = {
  waiting:      { background: '#F3F4F6', color: '#6B7280' },
  processing:   { background: '#DBEAFE', color: '#1D4ED8' },
  done:         { background: '#D1FAE5', color: '#047857' },
  error:        { background: '#FEE2E2', color: '#B91C1C' },
  needs_review: { background: '#FEF3C7', color: '#B45309' },
}
const STATUS_KEY = {
  waiting:      'batch_status_waiting',
  processing:   'batch_status_processing',
  done:         'batch_status_done',
  error:        'batch_status_error',
  needs_review: 'batch_status_needs_review',
}

const cardStyle = {
  background: 'white', borderRadius: 8, padding: 18,
  border: '1px solid var(--color-border)', marginBottom: 14,
}
const primaryBtn = (disabled) => ({
  padding: '12px 28px', borderRadius: 6, border: 'none',
  background: disabled ? '#B0BEC5' : 'var(--color-primary)',
  color: 'white', fontSize: 14, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
})
const secondaryBtn = {
  padding: '12px 22px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'white', fontSize: 14, cursor: 'pointer', color: 'var(--color-text)',
}

function buildPdfPath(voyageNumber, vesselName) {
  const sanitize = s => String(s || '').replace(/[^a-zA-Z0-9-_]/g, '_').replace(/_+/g, '_').slice(0, 40)
  const today = new Date().toISOString().split('T')[0]
  return `C:\\ShipFees\\receipts\\${sanitize(voyageNumber)}_${sanitize(vesselName)}_${today}.pdf`
}

const BatchImport = forwardRef(function BatchImport({ containerCodes, gcCodes, onExit, onReviewGroup, onViewReceipt }, ref) {
  const { t } = useTranslation()
  const { session, ratesData } = useSession()

  const [step, setStep]       = useState('select') // select | group | process | summary
  const [files, setFiles]     = useState([])       // [{ id, filename, images, timestamp }]
  const [groups, setGroups]   = useState([])
  const [busy, setBusy]       = useState(false)    // ingesting files
  const [running, setRunning] = useState(false)    // queue in flight
  const [dragOver, setDragOver] = useState(null)   // group id | 'zone' | 'new'
  const [toast, setToast]     = useState(null)
  const [hoverPreview, setHoverPreview] = useState(null) // { data, mediaType, top, left, pageId }
  const dragPageRef = useRef(null)

  useEffect(() => {
    if (!hoverPreview) return
    function onKey(e) { if (e.key === 'Escape') setHoverPreview(null) }
    function onDocClick() { setHoverPreview(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onDocClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onDocClick)
    }
  }, [!!hoverPreview])

  // PDF auto-export state: one voyage rendered at a time, batch loop awaits via ref
  const [pdfExportItem, setPdfExportItem] = useState(null) // { voyageNumber, filePath }
  const pdfResolveRef = useRef(null)

  // Parent marks a held group as inserted after the user finishes its review.
  useImperativeHandle(ref, () => ({
    resolveGroup(groupId, result) {
      setGroups(prev => prev.map(g =>
        g.id === groupId
          ? { ...g, status: 'done', result, review: null, voyageNumber: result.voyageNumber }
          : g
      ))
    },
  }))

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ── File ingestion ──────────────────────────────────────────────────────

  function makeUnit(filename, images, mtimeMs) {
    const fromName  = parseFilenameTimestamp(filename)
    const timestamp = fromName ?? (Number.isFinite(mtimeMs) && mtimeMs > 0 ? mtimeMs : null)
    return { id: nextId('p'), filename, images, timestamp }
  }

  function addUnits(units) {
    if (units.length === 0) return
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.filename))
      const fresh = []
      for (const u of units) {
        if (existing.has(u.filename)) {
          showToast(t('batch_dup_skipped', { name: u.filename }), 'error')
          continue
        }
        existing.add(u.filename)
        fresh.push(u)
      }
      return [...prev, ...fresh]
    })
  }

  async function browseFiles() {
    if (busy) return
    setBusy(true)
    try {
      const result = await window.api.openDocuments()
      if (!result.success || result.canceled) return
      const units = []
      for (const f of result.files) {
        if (f.size > MAX_BYTES) { showToast(`${f.filename}: ${t('import_error_file_size')}`, 'error'); continue }
        try {
          const images = f.mimeType === 'application/pdf'
            ? await pdfToImagesFromBase64(f.data)
            : [{ data: await compressToJpeg(f.data, f.mimeType), mediaType: 'image/jpeg' }]
          units.push(makeUnit(f.filename, images, f.mtimeMs))
        } catch (err) {
          showToast(`${f.filename}: ${err.message || t('import_error_pdf_page')}`, 'error')
        }
      }
      addUnits(units)
    } finally {
      setBusy(false)
    }
  }

  async function handleDropFiles(fileList) {
    if (busy) return
    setBusy(true)
    try {
      const units = []
      for (const file of Array.from(fileList)) {
        const name  = file.name
        const isPDF = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')
        const isImg = /image\/(jpeg|png|jpg)/.test(file.type) || /\.(jpe?g|png)$/i.test(name)
        if (!isPDF && !isImg) { showToast(t('batch_unsupported_file', { name }), 'error'); continue }
        if (file.size > MAX_BYTES) { showToast(`${name}: ${t('import_error_file_size')}`, 'error'); continue }
        try {
          let images
          if (isPDF) {
            images = await pdfToImages(file)
          } else {
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.onload  = e => resolve(e.target.result.split(',')[1])
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
            const srcType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
            images = [{ data: await compressToJpeg(base64, srcType), mediaType: 'image/jpeg' }]
          }
          units.push(makeUnit(name, images, file.lastModified))
        } catch (err) {
          showToast(`${name}: ${err.message || t('import_error_pdf_page')}`, 'error')
        }
      }
      addUnits(units)
    } finally {
      setBusy(false)
    }
  }

  // ── Processing queue ────────────────────────────────────────────────────

  const patch = (id, updates) =>
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))

  async function startProcessing() {
    if (running || groups.length === 0) return
    setStep('process')
    setRunning(true)

    const MAX_CONCURRENT = 3
    const FORM_UNCERTAIN_KEYS = new Set(['voyage_number','vessel_name','vessel_type','flag','shipping_agent','ata','atd','loa'])

    // Stage 1: parallel AI extraction (bounded concurrency)
    async function extractGroup(group) {
      patch(group.id, { status: 'processing', progress: 0 })
      const progressInterval = setInterval(() => {
        setGroups(prev => prev.map(g => {
          if (g.id !== group.id || g.status !== 'processing') return g
          const p = (g.progress || 0)
          return { ...g, progress: Math.min(Math.round(p + (90 - p) * 0.07), 89) }
        }))
      }, 350)

      try {
        const images = group.pages.flatMap(p => p.images)
        const res = await window.api.aiExtract(images)
        clearInterval(progressInterval)

        if (!res.success) {
          const key = EXTRACT_ERROR_KEYS[res.error]
          let msg = key ? t(key) : res.error
          if (res.detail) msg += ` (${res.detail})`
          patch(group.id, { status: 'error', error: msg, progress: 100 })
          return
        }

        const fields    = res.data
        const uncertain = new Set(fields.uncertain_fields || [])
        const built     = buildReviewState(fields, uncertain, containerCodes, gcCodes)
        const breakdowns = computeBreakdowns(built.berthingRows, built.form, ratesData)
        const { errors, validRows } = validateReviewData(built.form, built.berthingRows, breakdowns)

        const needsReview =
          [...built.uncertainFields].some(f => FORM_UNCERTAIN_KEYS.has(f)) ||
          built.serviceLines.some(l => l._uncertain) ||
          Object.keys(errors).length > 0

        if (needsReview) {
          patch(group.id, { status: 'needs_review', voyageNumber: built.form.voyageNumber || null, review: built, progress: 100 })
        } else {
          patch(group.id, { status: 'ready_to_insert', _validRows: validRows, _built: built, progress: 95 })
        }
      } catch (err) {
        clearInterval(progressInterval)
        patch(group.id, { status: 'error', error: err.message || 'Error', progress: 100 })
      }
    }

    // Promise pool with bounded concurrency
    const queue = [...groups]
    const active = []
    while (queue.length > 0 || active.length > 0) {
      while (active.length < MAX_CONCURRENT && queue.length > 0) {
        const group = queue.shift()
        const promise = extractGroup(group).then(() => {
          active.splice(active.indexOf(promise), 1)
        })
        active.push(promise)
      }
      if (active.length > 0) await Promise.race(active)
    }

    // Stage 2: sequential insert + receipt + PDF for ready groups
    const snapshot = await new Promise(resolve =>
      setGroups(prev => { resolve(prev); return prev })
    )
    for (const group of snapshot) {
      if (group.status !== 'ready_to_insert') continue
      try {
        const result = await insertVoyage({
          form: group._built.form, validRows: group._validRows,
          serviceLines: group._built.serviceLines, manualLines: [], userId: session.id,
        })
        patch(group.id, { status: 'done', result, voyageNumber: result.voyageNumber, _validRows: undefined, _built: undefined, progress: 100 })

        const receiptResult = await autoSaveReceipt(result.voyageNumber, session.username)
        if (!receiptResult.success) {
          patch(group.id, { receiptSaved: false, pdfPath: null, receiptSkipped: receiptResult.skip || false, receiptError: receiptResult.error || 'receipt_gen_failed' })
        } else {
          patch(group.id, { receiptSaved: true })
          const filePath = buildPdfPath(result.voyageNumber, receiptResult.rawData.header.vessel_name)
          const pdfResult = await new Promise(resolve => {
            pdfResolveRef.current = resolve
            setPdfExportItem({ voyageNumber: result.voyageNumber, filePath })
          })
          setPdfExportItem(null)
          patch(group.id, { pdfPath: pdfResult.error ? null : (pdfResult.path || null), receiptSkipped: false, receiptError: pdfResult.error || null })
        }
      } catch (err) {
        patch(group.id, { status: 'error', error: err.message || 'Error', _validRows: undefined, _built: undefined })
      }
    }

    setRunning(false)
    setStep('summary')
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  const totalPages    = groups.reduce((n, g) => n + g.pages.length, 0)
  const processedCount = groups.filter(g => ['done', 'error', 'needs_review', 'ready_to_insert'].includes(g.status)).length
  const insertedCount  = groups.filter(g => g.status === 'done').length
  const reviewCount    = groups.filter(g => g.status === 'needs_review').length
  const failedCount    = groups.filter(g => g.status === 'error').length

  const StatusChip = ({ status }) => (
    <span style={{
      ...STATUS_STYLE[status], padding: '3px 10px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {t(STATUS_KEY[status])}
    </span>
  )

  function groupTimeLabel(group) {
    const stamps = group.pages.map(p => p.timestamp).filter(ts => ts != null)
    if (stamps.length === 0) return t('batch_no_timestamp')
    const first = Math.min(...stamps)
    const last  = Math.max(...stamps)
    return first === last
      ? `${fmtDate(first)} ${fmtClock(first)}`
      : `${fmtDate(first)} ${fmtClock(first)} – ${fmtClock(last)}`
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? '#27ae60' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxWidth: 420,
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Click preview overlay ── */}
      {hoverPreview && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: hoverPreview.top, left: hoverPreview.left,
            zIndex: 99990, pointerEvents: 'all',
            background: 'white', border: '1px solid var(--color-border)',
            borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.18)', padding: 4,
          }}
        >
          <img
            src={`data:${hoverPreview.mediaType};base64,${hoverPreview.data}`}
            alt=""
            style={{ width: 512, height: 'auto', maxHeight: '85vh', borderRadius: 5, display: 'block' }}
          />
        </div>
      )}

      {/* ── STEP 1: file selection ── */}
      {step === 'select' && (
        <div style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🗂 {t('batch_select_title')}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18, lineHeight: 1.7 }}>
            {t('batch_select_hint')}
          </div>

          <div
            onDragOver={e => { e.preventDefault(); if (dragOver !== 'zone') setDragOver('zone') }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => { e.preventDefault(); setDragOver(null); handleDropFiles(e.dataTransfer.files) }}
            style={{
              border: `2px dashed ${dragOver === 'zone' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: dragOver === 'zone' ? '#F0F6FF' : '#FAFBFC',
              borderRadius: 10, padding: '44px 20px', textAlign: 'center', marginBottom: 16,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <div style={{ fontSize: 38, marginBottom: 10 }}>📥</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--color-text)' }}>
              {t('batch_drop_hint')}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={browseFiles}
              style={{
                padding: '11px 26px', borderRadius: 6, fontSize: 14, fontWeight: 600,
                border: '1px solid var(--color-primary)', background: 'white',
                color: 'var(--color-primary)', cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? '⏳ ' + t('import_document_loading') : t('batch_browse')}
            </button>
          </div>

          {files.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {t('batch_files_count', { count: files.length })}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => { setFiles([]); setGroups([]) }}
                  style={{
                    padding: '3px 10px', borderRadius: 5, border: '1px solid var(--color-danger)',
                    background: 'white', fontSize: 11, color: 'var(--color-danger)',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {t('batch_remove_all')}
                </button>
              </div>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, marginBottom: 16, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                {files.map((f, i) => (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', padding: '8px 14px', fontSize: 13,
                    borderBottom: i < files.length - 1 ? '1px solid #F0F0F0' : 'none',
                  }}>
                    <img
                      src={`data:${f.images[0].mediaType};base64,${f.images[0].data}`}
                      alt=""
                      style={{ width: 34, height: 26, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--color-border)' }}
                    />
                    <span style={{ flex: 1, marginInline: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.filename}
                    </span>
                    {f.images.length > 1 && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginInlineEnd: 8 }}>
                        ({f.images.length} pg)
                      </span>
                    )}
                    <span className="num-ltr" style={{ fontSize: 11, color: 'var(--color-text-muted)', marginInlineEnd: 10 }}>
                      {f.timestamp != null ? `${fmtDate(f.timestamp)} ${fmtClock(f.timestamp)}` : t('batch_no_timestamp')}
                    </span>
                    <button
                      onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))}
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
                    >×</button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              disabled={files.length === 0 || busy}
              onClick={() => { setGroups(buildGroups(files)); setStep('group') }}
              style={primaryBtn(files.length === 0 || busy)}
            >
              {t('batch_continue')}
            </button>
            <button onClick={onExit} style={secondaryBtn}>{t('batch_back')}</button>
          </div>
        </div>
      )}

      {/* ── STEP 2/3: grouping review ── */}
      {step === 'group' && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🧩 {t('batch_group_title')}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18, lineHeight: 1.7 }}>
            {t('batch_group_hint')}
          </div>

          {groups.map((group, gi) => (
            <div
              key={group.id}
              onDragOver={e => { e.preventDefault(); if (dragOver !== group.id) setDragOver(group.id) }}
              onDragLeave={() => setDragOver(prev => prev === group.id ? null : prev)}
              onDrop={e => {
                e.preventDefault(); setDragOver(null)
                const pageId = dragPageRef.current || e.dataTransfer.getData('text/plain')
                if (pageId) setGroups(prev => movePage(prev, pageId, group.id))
                dragPageRef.current = null
              }}
              style={{
                ...cardStyle,
                border: dragOver === group.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  🧾 {t('batch_receipt')} <span className="num-ltr">{gi + 1}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {t('batch_pages_count', { count: group.pages.length })}
                </span>
                <span className="num-ltr" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {groupTimeLabel(group)}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => setGroups(prev => prev.filter(g => g.id !== group.id))}
                  title={t('batch_remove_group')}
                  style={{
                    background: 'none', border: 'none', color: 'var(--color-danger)',
                    cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px',
                  }}
                >×</button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {group.pages.map((page, pi) => (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={e => { dragPageRef.current = page.id; e.dataTransfer.setData('text/plain', page.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation(); setDragOver(null)
                      const pageId = dragPageRef.current || e.dataTransfer.getData('text/plain')
                      if (pageId) setGroups(prev => movePage(prev, pageId, group.id, page.id))
                      dragPageRef.current = null
                    }}
                    style={{ width: 112, cursor: 'grab' }}
                    title={page.filename}
                  >
                    <div style={{ position: 'relative' }}>
                      <img
                        src={`data:${page.images[0].mediaType};base64,${page.images[0].data}`}
                        alt={page.filename}
                        style={{
                          width: '100%', height: 82, objectFit: 'cover', borderRadius: 6,
                          border: `1px solid ${hoverPreview?.pageId === page.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          display: 'block', cursor: 'zoom-in',
                        }}
                        onClick={e => {
                          e.stopPropagation()
                          if (hoverPreview?.pageId === page.id) { setHoverPreview(null); return }
                          const rect = e.currentTarget.getBoundingClientRect()
                          const PREVIEW_W = 524
                          const PREVIEW_MAX_H = window.innerHeight * 0.85 + 16
                          let left = rect.right + 12
                          if (left + PREVIEW_W > window.innerWidth) left = Math.max(4, rect.left - PREVIEW_W)
                          let top = rect.top - 20
                          if (top + PREVIEW_MAX_H > window.innerHeight) top = Math.max(8, window.innerHeight - PREVIEW_MAX_H - 8)
                          setHoverPreview({ data: page.images[0].data, mediaType: page.images[0].mediaType, top, left, pageId: page.id })
                        }}
                      />
                      <span className="num-ltr" style={{
                        position: 'absolute', top: 4, insetInlineStart: 4,
                        background: 'rgba(27,42,74,0.85)', color: 'white',
                        fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                      }}>
                        {pi + 1}
                      </span>
                      {page.images.length > 1 && (
                        <span style={{
                          position: 'absolute', bottom: 4, insetInlineEnd: 4,
                          background: 'rgba(0,0,0,0.6)', color: 'white',
                          fontSize: 9, borderRadius: 4, padding: '1px 5px',
                        }}>
                          {page.images.length} pg
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }}>
                      {page.filename}
                    </div>
                    <div className="num-ltr" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      {page.timestamp != null ? fmtClock(page.timestamp) : '—'}
                    </div>
                    {group.pages.length > 1 && (
                      <button
                        onClick={() => setGroups(prev => splitPage(prev, page.id))}
                        style={{
                          marginTop: 3, padding: '3px 8px', width: '100%', borderRadius: 4,
                          border: '1px dashed var(--color-border)', background: 'white',
                          fontSize: 10, color: 'var(--color-text-muted)', cursor: 'pointer',
                        }}
                      >
                        ✂ {t('batch_split')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* drop target: new receipt */}
          <div
            onDragOver={e => { e.preventDefault(); if (dragOver !== 'new') setDragOver('new') }}
            onDragLeave={() => setDragOver(prev => prev === 'new' ? null : prev)}
            onDrop={e => {
              e.preventDefault(); setDragOver(null)
              const pageId = dragPageRef.current || e.dataTransfer.getData('text/plain')
              if (pageId) setGroups(prev => movePageToNewGroup(prev, pageId))
              dragPageRef.current = null
            }}
            style={{
              border: `2px dashed ${dragOver === 'new' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: dragOver === 'new' ? '#F0F6FF' : 'transparent',
              borderRadius: 10, padding: '18px 20px', textAlign: 'center',
              fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20,
            }}
          >
            ＋ {t('batch_new_group_drop')}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              disabled={groups.length === 0}
              onClick={startProcessing}
              style={primaryBtn(groups.length === 0)}
            >
              ▶ {t('batch_start_processing', { receipts: groups.length, pages: totalPages })}
            </button>
            <button onClick={() => { setGroups([]); setStep('select') }} style={secondaryBtn}>
              {t('batch_back')}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4/5: queue progress + summary ── */}
      {(step === 'process' || step === 'summary') && (
        <div>
          {step === 'process' ? (
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>⏳ {t('batch_processing_title')}</div>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>🏁 {t('batch_summary_title')}</div>
          )}

          {/* progress bar */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
              <span>{t('batch_progress', { done: processedCount, total: groups.length })}</span>
              <span className="num-ltr">{groups.length > 0 ? Math.round(processedCount / groups.length * 100) : 0}%</span>
            </div>
            <div style={{ width: '100%', height: 10, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${groups.length > 0 ? processedCount / groups.length * 100 : 0}%`,
                background: 'linear-gradient(90deg, #1B2A4A, #3B5998)',
                borderRadius: 99, transition: 'width 0.35s ease',
              }} />
            </div>

            {step === 'summary' && (
              <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: '#047857' }}>✅ <span className="num-ltr">{insertedCount}</span> {t('batch_summary_inserted')}</span>
                <span style={{ color: '#B45309' }}>⚠ <span className="num-ltr">{reviewCount}</span> {t('batch_summary_review')}</span>
                <span style={{ color: '#B91C1C' }}>❌ <span className="num-ltr">{failedCount}</span> {t('batch_summary_failed')}</span>
              </div>
            )}
          </div>

          {/* group status list */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            {groups.map((group, gi) => {
              const clickable = step === 'summary' && group.status === 'needs_review'
              return (
                <div
                  key={group.id}
                  onClick={clickable ? () => onReviewGroup(group) : undefined}
                  style={{
                    padding: '12px 18px',
                    borderBottom: gi < groups.length - 1 ? '1px solid #F0F0F0' : 'none',
                    cursor: clickable ? 'pointer' : 'default',
                    background: clickable ? '#FFFDF5' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      🧾 {t('batch_receipt')} <span className="num-ltr">{gi + 1}</span>
                    </span>
                    {group.voyageNumber && (
                      <span className="num-ltr" style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600 }}>
                        {group.voyageNumber}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {t('batch_pages_count', { count: group.pages.length })}
                    </span>
                    <span style={{ flex: 1 }} />
                    {group.status === 'done' && group.result && (
                      <span className="num-ltr" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {fmt(group.result.berthingFee)}
                      </span>
                    )}
                    {/* Receipt / PDF status chips for done groups */}
                    {step === 'summary' && group.status === 'done' && group.pdfPath && (
                      <span title={group.pdfPath} style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>
                        📄 {t('batch_pdf_saved')}
                      </span>
                    )}
                    {step === 'summary' && group.status === 'done' && group.receiptSaved && !group.pdfPath && (
                      <span title={group.receiptError || ''} style={{ fontSize: 11, color: '#B45309', fontWeight: 600 }}>
                        ⚠ {t('batch_pdf_failed')}
                      </span>
                    )}
                    {step === 'summary' && group.status === 'done' && group.receiptSkipped && (
                      <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>
                        {t('batch_receipt_skipped')}
                      </span>
                    )}
                    <StatusChip status={group.status} />
                    {clickable && (
                      <span style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>
                        {t('batch_open_review')} ‹
                      </span>
                    )}
                    {/* View/Generate Receipt button for done groups */}
                    {step === 'summary' && group.status === 'done' && group.voyageNumber && onViewReceipt && (
                      <button
                        onClick={e => { e.stopPropagation(); onViewReceipt(group.voyageNumber) }}
                        style={{
                          padding: '3px 10px', borderRadius: 5, border: '1px solid var(--color-border)',
                          background: 'white', fontSize: 11, cursor: 'pointer',
                          color: group.receiptSaved ? 'var(--color-primary)' : 'var(--color-text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {group.receiptSaved ? t('batch_view_receipt') : t('generate_receipt')}
                      </button>
                    )}
                    {step === 'summary' && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (group.status === 'needs_review') {
                            const ok = await window.api.dialogConfirm({ title: t('confirm'), message: t('batch_confirm_remove_reviewed') })
                            if (!ok) return
                          }
                          setGroups(prev => prev.filter(g => g.id !== group.id))
                        }}
                        title={t('batch_remove_group')}
                        style={{
                          background: 'none', border: 'none', color: 'var(--color-danger)',
                          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px',
                        }}
                      >×</button>
                    )}
                  </div>
                  {group.status === 'processing' && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ width: '100%', height: 4, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${group.progress || 0}%`,
                          background: 'linear-gradient(90deg, #1B2A4A, #3B5998)',
                          borderRadius: 99, transition: 'width 0.35s ease',
                        }} />
                      </div>
                    </div>
                  )}
                  {group.status === 'error' && group.error && (
                    <div style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 6 }}>
                      {group.error}
                    </div>
                  )}
                  {group.status === 'done' && group.receiptError && !group.receiptSkipped && !group.pdfPath && (
                    <div style={{ fontSize: 11, color: '#B45309', marginTop: 4 }}>
                      {group.receiptError}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {step === 'summary' && (
            <>
              {reviewCount > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14 }}>
                  💡 {t('batch_review_hint')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {reviewCount > 0 && (
                  <button
                    onClick={() => {
                      const next = groups.find(g => g.status === 'needs_review')
                      if (next) onReviewGroup(next)
                    }}
                    style={primaryBtn(false)}
                  >
                    ⚠ {t('batch_review_pending')} (<span className="num-ltr">{reviewCount}</span>)
                  </button>
                )}
                <button
                  onClick={() => { setFiles([]); setGroups([]); setStep('select') }}
                  style={reviewCount > 0 ? secondaryBtn : primaryBtn(false)}
                >
                  {t('batch_new_batch')}
                </button>
                <button onClick={onExit} style={secondaryBtn}>{t('batch_done')}</button>
              </div>
            </>
          )}
        </div>
      )}

    {/* Receipt overlay for silent batch PDF export — rendered one at a time, awaited by startProcessing */}
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
    </>
  )
})

export default BatchImport
