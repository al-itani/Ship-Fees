import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import { calcBerthingFee } from '../../logic/berthingCalc.js'
import DocumentImport from '../../components/DocumentImport.jsx'
import SearchableSelect from '../../components/SearchableSelect.jsx'
import { COUNTRIES } from '../../data/countries.js'

const POSITIONS = ['Quay', 'P2', 'En Rade']

const POSITION_MAP = {
  'QUAY':     'Quay',
  'POS_1':    'Quay',
  'POS1':     'Quay',
  'P1':       'Quay',
  'P2':       'P2',
  'POS_2':    'P2',
  'POS2':     'P2',
  'EN RADE':  'En Rade',
  'ENRADE':   'En Rade',
  'EN-RADE':  'En Rade',
}

// Pos 3 / P3 is a free anchorage — no berthing fee, excluded from billing entirely
const FREE_POSITION_KEYS = new Set(['P3', 'POS3', 'POS_3'])

function normalizePosition(raw) {
  if (!raw) return ''
  const key = String(raw).toUpperCase().trim()
  return POSITION_MAP[key] ?? (POSITIONS.includes(raw) ? raw : '')
}
const VESSEL_CATEGORIES = [
  'Lebanese', 'Wooden Coasters', 'Sailboats', 'Passenger', 'Tourist',
  'Ro-Ro', 'Military', 'Lebanese Government (Non-Commercial)',
]
const VESSEL_TYPES = ['Container', 'General Cargo']

const EMPTY_FORM = {
  voyageNumber: '', vesselName: '', vesselType: '',
  flag: '', shippingAgent: '', ata: '', atd: '',
  loa: '', vesselCategory: '', maintenance: 'No',
}
const EMPTY_ROW = { position: '', days: '' }

function toDateInput(ddmmyyyy) {
  if (!ddmmyyyy) return ''
  const p = String(ddmmyyyy).split('/')
  if (p.length !== 3) return ''
  return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00`
}

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

export default function AutomateScreen() {
  const { t } = useTranslation()
  const { session, ratesData, agents } = useSession()

  const [phase, setPhase]               = useState('upload')
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
    const loa = parseFloat(form.loa)
    const newBreakdowns = berthingRows.map(row => {
      const days = parseInt(row.days)
      if (!loa || loa <= 0 || !days || days <= 0 || !row.position) return null
      try {
        return calcBerthingFee({
          loa, days,
          position:       row.position,
          vesselCategory: form.vesselCategory || null,
          maintenance:    form.maintenance,
          rates:          ratesData.rates,
          minimums:       ratesData.minimums,
          categories:     ratesData.categories,
        })
      } catch { return null }
    })
    setBreakdowns(newBreakdowns)
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

  function handleImportExtracted({ fields, uncertain, error }) {
    if (error) { showToast(error, 'error'); return }
    if (!fields) return

    const vesselType  = fields.vessel_type || ''
    const isContainer = vesselType.toLowerCase().includes('container')

    setForm({
      voyageNumber:   String(fields.voyage_number || ''),
      vesselName:     String(fields.vessel_name || ''),
      vesselType,
      flag:           fields.flag ? String(fields.flag) : 'Lebanon',
      shippingAgent:  String(fields.shipping_agent || ''),
      ata:            toDateInput(fields.ata),
      atd:            toDateInput(fields.atd),
      loa:            fields.loa != null ? String(fields.loa) : '',
      vesselCategory: '',
      maintenance:    'No',
    })

    const rawRows = (fields.berthing || [])
      .filter(b => !FREE_POSITION_KEYS.has(String(b.position || '').toUpperCase().trim()))
      .map(b => ({
        position: normalizePosition(b.position),
        days:     b.days != null ? String(b.days) : '',
      }))
    setBerthingRows(rawRows.length > 0 ? rawRows : [{ ...EMPTY_ROW }])
    setBreakdowns(rawRows.map(() => null))

    const servicesAfterRSFilter = (fields.services || [])
      .filter(s => s.code)
      .filter(s => !String(s.code).toUpperCase().startsWith('RS'))

    const importedLines = servicesAfterRSFilter.map(s => {
      if (isContainer) {
        const mc    = containerCodes.find(c => c.code.toLowerCase() === String(s.code).toLowerCase())
        const qty   = Number(s.quantity) || 1
        const ctype = s.container_size || null
        const defaultRate = ctype === '40ft' && mc?.default_rate_40 != null
          ? mc.default_rate_40
          : (mc?.default_rate_20 ?? 0)
        // Strip currency symbols/spaces before converting — Claude occasionally returns "$26.54"
        const rawPrice = parseFloat(String(s.price_per_unit ?? '').replace(/[$,\s]/g, ''))
        const price    = isFinite(rawPrice) ? rawPrice : defaultRate
        return {
          _type:          'container',
          service_code:   mc?.code || String(s.code).toUpperCase(),
          description:    mc?.description || '',
          container_type: ctype || '20ft',
          quantity:       qty,
          price_per_unit: price,
          line_total:     qty * price,
          is_taxable:     mc?.is_taxable || 0,
          _uncertain:     uncertain?.has('services') || !mc || !ctype,
        }
      } else {
        const mc      = gcCodes.find(c => c.code.toLowerCase() === String(s.code).toLowerCase())
        const qty     = Number(s.quantity) || 1
        const rawRate = parseFloat(String(s.price_per_unit ?? '').replace(/[$,\s]/g, ''))
        const rate    = isFinite(rawRate) ? rawRate : (mc?.rate ?? 0)
        const min   = mc?.minimum || 0
        const total = min > 0 ? Math.max(qty * rate, min) : qty * rate
        return {
          _type:           'gc',
          service_code:    mc?.code || String(s.code).toUpperCase(),
          description:     mc?.description || '',
          unit:            mc?.unit || '',
          quantity:        qty,
          rate,
          minimum:         min,
          line_total:      total,
          minimum_applied: min > 0 && qty * rate < min ? 1 : 0,
          is_taxable:      mc?.is_taxable || 0,
          _uncertain:      uncertain?.has('services') || !mc,
        }
      }
    })

    const finalUncertain = uncertain ? new Set(uncertain) : new Set()
    if (!fields.flag) finalUncertain.delete('flag')

    setServiceLines(importedLines)
    if (uncertain) setUncertainFields(finalUncertain)
    setErrors({})
    setPhase('review')
  }

  async function handleInsertAll() {
    const e = {}
    if (!form.voyageNumber.trim()) e.voyageNumber = true
    if (!form.vesselName.trim())   e.vesselName   = true
    if (!form.shippingAgent)       e.shippingAgent = true
    if (!form.ata)                 e.ata           = true
    if (!form.atd)                 e.atd           = true
    if (!form.loa || parseFloat(form.loa) <= 0) e.loa = true

    const validRows = berthingRows
      .map((row, i) => ({ row, bd: breakdowns[i] }))
      .filter(({ row, bd }) => row.position && bd)
    if (validRows.length === 0) e.berthing = true

    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSaving(true)
    try {
      const voyageNumber = form.voyageNumber.trim()
      const commonPayload = {
        voyage_number:   voyageNumber,
        bill_number:     voyageNumber,
        vessel_name:     form.vesselName.trim(),
        vessel_type:     form.vesselType || null,
        flag:            form.flag || null,
        shipping_agent:  form.shippingAgent,
        ata:             form.ata,
        atd:             form.atd,
        loa:             parseFloat(form.loa),
        vessel_category: form.vesselCategory || null,
        maintenance:     form.maintenance,
      }

      const allBerthing = await window.api.getBerthingRecords()
      const existingRecords = allBerthing.success
        ? allBerthing.data.filter(r => r.voyage_number === voyageNumber && !r.is_deleted)
        : []

      let totalFee = 0
      for (let i = 0; i < validRows.length; i++) {
        const { row, bd } = validRows[i]
        const payload = {
          ...commonPayload,
          days:               parseInt(row.days),
          position:           row.position,
          l_index:            bd.lIndex,
          d1_days:            bd.d1Days,
          d2_days:            bd.d2Days,
          d3_days:            bd.d3Days,
          raw_fee:            bd.rawFee,
          discount_factor:    bd.discountFactor,
          fee_after_discount: bd.feeAfterDiscount,
          min_fee:            bd.minFee,
          late_fee:           0,
          maintenance_fee:    bd.maintenanceFee,
          final_fee:          bd.finalFee,
        }
        totalFee += bd.finalFee

        const bRes = existingRecords[i]
          ? await window.api.updateBerthing(existingRecords[i].id, { ...payload, updated_by: session.id })
          : await window.api.saveBerthing({ ...payload, created_by: session.id })
        if (!bRes.success) { showToast(bRes.error || 'Error saving berthing', 'error'); return }
      }

      let servicesSaved = 0
      if (serviceLines.length > 0) {
        const isContainer = serviceLines[0]._type === 'container'
        const svc = { voyageNumber, vesselName: form.vesselName.trim(), vesselType: form.vesselType || null, lines: serviceLines, created_by: session.id, replaceUserLines: true }
        const sRes = isContainer
          ? await window.api.containerSaveSession(svc)
          : await window.api.gcSaveSession(svc)
        if (!sRes.success) { showToast(sRes.error || 'Error saving services', 'error'); return }
        servicesSaved = serviceLines.length
      }

      setDoneInfo({ voyageNumber, servicesSaved, berthingFee: totalFee })
      setPhase('done')
    } catch (err) {
      showToast(err.message || 'Error', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleStartOver() {
    setPhase('upload')
    setForm(EMPTY_FORM)
    setBerthingRows([{ ...EMPTY_ROW }])
    setBreakdowns([null])
    setServiceLines([])
    setUncertainFields(new Set())
    setErrors({})
    setDoneInfo(null)
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
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
    ? <span title={t('import_uncertain_tooltip')} style={{ color: '#F59E0B', marginInlineStart: 5, fontSize: 13 }}>⚠</span>
    : null

  const ataDate = form.ata ? form.ata.split('T')[0] : ''
  const ataTime = form.ata ? (form.ata.split('T')[1] || '').slice(0, 5) : ''
  const atdDate = form.atd ? form.atd.split('T')[0] : ''
  const atdTime = form.atd ? (form.atd.split('T')[1] || '').slice(0, 5) : ''

  const isContainerSession = serviceLines.length > 0 && serviceLines[0]._type === 'container'
  const hasAnyBreakdown    = breakdowns.some(Boolean)
  const totalBerthingFee   = breakdowns.reduce((sum, bd) => sum + (bd?.finalFee || 0), 0)

  return (
    <div style={{ padding: 28, maxWidth: 960 }}>

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

      {/* ── UPLOAD ── */}
      {phase === 'upload' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: '52px 72px',
            border: '1px solid var(--color-border)', textAlign: 'center', maxWidth: 500,
          }}>
            <div style={{ fontSize: 52, marginBottom: 20 }}>📄</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: 'var(--color-text)' }}>
              {t('automate_import_prompt')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 32, lineHeight: 1.7 }}>
              {t('automate_import_hint')}
            </div>
            <DocumentImport onExtracted={handleImportExtracted} />
          </div>
        </div>
      )}

      {/* ── REVIEW ── */}
      {phase === 'review' && (
        <>
          {/* Berthing card */}
          <div style={{ background: 'white', borderRadius: 8, padding: 24, border: '1px solid var(--color-border)', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: 'var(--color-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚓ {t('berthing')}</span>
              {uncertainFields.size > 0 && (
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
          {serviceLines.length > 0 && (
            <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F0F0', fontWeight: 700, fontSize: 15 }}>
                📋 {t('services_section')} ({serviceLines.length})
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
                  {serviceLines.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F5F5F5', background: l._uncertain ? '#FFFBEB' : 'transparent' }}>
                      <td style={tdStyle}>
                        <strong>{l.service_code}</strong>
                        {' '}
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{l.description}</span>
                        {l._uncertain && <span title={t('import_uncertain_tooltip')} style={{ color: '#F59E0B', marginInlineStart: 4 }}>⚠</span>}
                      </td>
                      {isContainerSession && <td style={tdStyle}>{l.container_type}</td>}
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr">{l.quantity}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr">{fmt(l._type === 'container' ? l.price_per_unit : l.rate)}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'end' }}>
                        <span className="num-ltr" style={{ fontWeight: 600 }}>{fmt(l.line_total)}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => setServiceLines(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
              onClick={handleStartOver}
              style={{ padding: '12px 24px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 14, cursor: 'pointer' }}
            >
              {t('automate_start_over')}
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
            </div>
            <button
              onClick={handleStartOver}
              style={{ padding: '12px 28px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('automate_start_over')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
