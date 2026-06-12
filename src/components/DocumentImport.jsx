import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

// Compress a base64 image to JPEG, capping longest dimension at MAX_DIM.
// Claude's hard limit is 5 MB raw; this keeps output well below that.
const MAX_DIM     = 2000
const JPEG_QUALITY = 0.82

export function compressToJpeg(base64, srcMediaType) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = reject
    img.onload  = () => {
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1])
    }
    img.src = `data:${srcMediaType};base64,${base64}`
  })
}

// Rasterise each page of a PDF (up to 4) into separate JPEG images.
// Returns an array of { data: base64, mediaType } — one entry per page.
// Each page is rendered at full quality; Claude receives them as separate images.
export async function pdfToImages(file) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  if (!GlobalWorkerOptions.workerSrc) {
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    GlobalWorkerOptions.workerSrc = workerUrl
  }

  const arrayBuffer = await file.arrayBuffer()
  const pdf      = await getDocument({ data: arrayBuffer }).promise
  const numPages = Math.min(pdf.numPages, 4)
  const results  = []

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const vp   = page.getViewport({ scale: 1.5 })
    const c    = document.createElement('canvas')
    c.width    = vp.width
    c.height   = vp.height
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise

    // Scale down if this page exceeds MAX_DIM (preserves aspect ratio)
    let w = c.width, h = c.height
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h)
      w = Math.round(w * ratio)
      h = Math.round(h * ratio)
      const scaled = document.createElement('canvas')
      scaled.width  = w
      scaled.height = h
      scaled.getContext('2d').drawImage(c, 0, 0, w, h)
      results.push({ data: scaled.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1], mediaType: 'image/jpeg' })
    } else {
      results.push({ data: c.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1], mediaType: 'image/jpeg' })
    }
  }

  return results
}

export default function DocumentImport({ onExtracted, disabled }) {
  const { t } = useTranslation()
  const inputRef     = useRef(null)
  const intervalRef  = useRef(null)
  const [loading, setLoading]       = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [progress, setProgress]     = useState(0)

  useEffect(() => () => clearInterval(intervalRef.current), [])

  function startSimulatedProgress(from) {
    clearInterval(intervalRef.current)
    let current = from
    intervalRef.current = setInterval(() => {
      current += (90 - current) * 0.07
      setProgress(Math.min(Math.round(current), 89))
    }, 350)
  }

  function showError(msg) {
    // Dispatches a custom event so parent can show a toast, or we show inline
    const ev = new CustomEvent('doc-import-error', { detail: msg, bubbles: true })
    inputRef.current?.dispatchEvent(ev)
    // Also alert as fallback — replaced by toast in parent via prop
    onExtracted({ error: msg })
  }

  async function handleFile(file) {
    if (!file) return

    if (file.size > MAX_BYTES) {
      showError(t('import_error_file_size'))
      return
    }

    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImg = /image\/(jpeg|png|jpg)/.test(file.type)

    if (!isPDF && !isImg) {
      showError(t('import_error_file_size')) // reuse generic error
      return
    }

    setLoading(true)
    setProgress(0)

    try {
      let images

      if (isPDF) {
        setLoadingMsg(t('import_processing_pdf'))
        setProgress(5)
        try {
          images = await pdfToImages(file)
        } catch {
          onExtracted({ error: t('import_error_pdf_page') })
          return
        }
      } else {
        setLoadingMsg(t('import_document_loading'))
        setProgress(5)
        const srcBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload  = e => resolve(e.target.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const srcType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const data    = await compressToJpeg(srcBase64, srcType)
        images = [{ data, mediaType: 'image/jpeg' }]
      }

      setProgress(20)
      setLoadingMsg(t('import_document_loading'))
      startSimulatedProgress(20)
      const res = await window.api.aiExtract(images)
      clearInterval(intervalRef.current)
      setProgress(100)

      if (!res.success) {
        const msgMap = {
          no_api_key:           t('import_error_no_key'),
          invalid_api_key_format: t('import_error_invalid_key'),
          invalid_api_key:      t('import_error_invalid_key'),
          network_error:        t('import_error_network'),
          invalid_json:         res.detail ? `${t('import_error_json')} Raw: ${res.detail}` : t('import_error_json'),
          empty_response:       t('import_error_json'),
        }
        const msg = msgMap[res.error] || res.error
        onExtracted({ error: res.detail ? `${msg} (${res.detail})` : msg })
        return
      }

      const raw      = res.data
      const uncertain = new Set(raw.uncertain_fields || [])

      onExtracted({ fields: raw, uncertain })
    } finally {
      clearInterval(intervalRef.current)
      setLoading(false)
      setLoadingMsg('')
      setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])}
      />

      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => inputRef.current?.click()}
        title={t('import_document')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          border: '1px solid #D97706',
          background: disabled || loading ? '#FEF3C7' : 'white',
          color: disabled || loading ? '#D97706' : '#D97706',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!disabled && !loading) e.currentTarget.style.background = '#FFFBEB' }}
        onMouseLeave={e => { if (!disabled && !loading) e.currentTarget.style.background = 'white' }}
      >
        <span>📄</span>
        <span>{loading ? loadingMsg : t('import_document')}</span>
      </button>

      {/* Full-screen loading overlay */}
      {loading && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 99999,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: '40px 52px',
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            minWidth: 320,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1B2A4A' }}>
              {loadingMsg}
            </div>

            {/* Progress bar track */}
            <div style={{ width: '100%', height: 10, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #1B2A4A, #3B5998)',
                borderRadius: 99,
                transition: 'width 0.35s ease',
              }} />
            </div>

            <div style={{ fontSize: 22, fontWeight: 700, color: '#1B2A4A', letterSpacing: '-0.5px' }}>
              {progress}%
            </div>
          </div>
        </div>
      )}
    </>
  )
}
