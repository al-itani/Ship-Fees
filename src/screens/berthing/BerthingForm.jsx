import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { useSession } from '../../context/SessionContext.jsx'
import { calcBerthingFee } from '../../logic/berthingCalc.js'
import SearchableSelect from '../../components/SearchableSelect.jsx'
import { COUNTRIES } from '../../data/countries.js'

const POSITIONS = ['Quay', 'P2', 'En Rade', 'Congestion']
const VESSEL_CATEGORIES = [
  'Lebanese', 'Wooden Coasters', 'Sailboats', 'Passenger', 'Tourist',
  'Ro-Ro', 'Military', 'Lebanese Government (Non-Commercial)',
  'VOBO', 'TOUR',
]
const VESSEL_TYPES = ['Container', 'General Cargo', 'RoRo', 'Petrolien']

// Position aliases for AI import
const POS_ALIASES = {
  QUAY: 'Quay', POS1: 'Quay', POS_1: 'Quay', P1: 'Quay',
  P2: 'P2', POS2: 'P2', POS_2: 'P2',
  'EN RADE': 'En Rade', ENRADE: 'En Rade', 'EN-RADE': 'En Rade',
  CONGESTION: 'Congestion', CONG: 'Congestion',
}
const FREE_POSITIONS = new Set(['P3', 'POS3', 'POS_3', 'EN RADE FREE', 'ENRADE FREE'])

function normalizePos(raw) {
  if (!raw) return ''
  const key = String(raw).toUpperCase().trim()
  return POS_ALIASES[key] || POSITIONS.find(p => p.toLowerCase() === raw.toLowerCase()) || ''
}

function toDatetimeLocal(isoStr) {
  if (!isoStr) return ''
  try { return format(parseISO(isoStr), "yyyy-MM-dd'T'HH:mm") } catch { return isoStr.slice(0, 16) }
}

function expandDateYear(v) {
  if (!v) return v
  const parts = v.split('-')
  if (parts.length !== 3) return v
  const year = parseInt(parts[0], 10)
  if (!isNaN(year) && year >= 0 && year < 100) {
    parts[0] = String(2000 + year).padStart(4, '0')
    return parts.join('-')
  }
  return v
}

const EMPTY_FORM = {
  voyageNumber: '', vesselName: '', vesselType: '', roroCargotype: '',
  flag: '', shippingAgent: '', ata: '', atd: '',
  loa: '', vesselCategory: '', maintenance: 'No',
}
const EMPTY_LINE = { position: '', days: '' }

export default function BerthingForm({ editVoyageNumber, onSaved, onCancelEdit, onGoToContainers, onGoToGeneralCargo, onGenerateReceipt, initialVoyageNumber }) {
  const { t } = useTranslation()
  const { session, ratesData, agents } = useSession()

  const [ships, setShips]           = useState([])
  const [form, setForm]             = useState(EMPTY_FORM)
  const [lines, setLines]           = useState([{ ...EMPTY_LINE }])
  const [breakdowns, setBreakdowns] = useState([null])
  const [errors, setErrors]         = useState({})
  const [voyageWarn, setVoyageWarn] = useState(null)
  const [showConfirm, setShowConfirm]               = useState(false)
  const [postSaveVoyage, setPostSaveVoyage]         = useState(null)
  const [postSaveVesselType, setPostSaveVesselType] = useState(null)
  const [saving, setSaving]                         = useState(false)
  const [toast, setToast]                           = useState(null)
  const [uncertainFields, setUncertainFields]       = useState(new Set())

  const isEditing = !!editVoyageNumber

  useEffect(() => {
    window.api.shipsGetAll().then(res => {
      if (res.success) setShips(res.data)
    })
  }, [])

  // Populate form in edit mode — load all berthing rows for the voyage
  useEffect(() => {
    if (editVoyageNumber) {
      window.api.berthingGetByVoyage(editVoyageNumber).then(res => {
        if (!res.success || res.data.length === 0) return
        const first = res.data[0]
        setForm({
          voyageNumber:   editVoyageNumber,
          vesselName:     first.vessel_name,
          vesselType:     first.vessel_type || '',
          roroCargotype:  first.roro_cargo_type || '',
          flag:           first.flag || '',
          shippingAgent:  first.shipping_agent,
          ata:            toDatetimeLocal(first.ata),
          atd:            toDatetimeLocal(first.atd),
          loa:            String(first.loa),
          vesselCategory: first.vessel_category || '',
          maintenance:    first.maintenance,
        })
        setLines(res.data.map(r => ({ position: r.position, days: String(r.days) })))
      })
    } else {
      setForm({ ...EMPTY_FORM, voyageNumber: initialVoyageNumber || '' })
      setLines([{ ...EMPTY_LINE }])
      setBreakdowns([null])
    }
    setErrors({})
    setVoyageWarn(null)
  }, [editVoyageNumber, initialVoyageNumber])

  // Per-line fee calc — runs when LOA, Category, Maintenance, or any line changes
  useEffect(() => {
    if (!ratesData) { setBreakdowns(lines.map(() => null)); return }
    const loa = parseFloat(form.loa)
    setBreakdowns(lines.map(line => {
      const days = Math.ceil(Number(line.days))
      if (!loa || loa <= 0 || !days || days <= 0 || !line.position) return null
      try {
        return calcBerthingFee({
          loa, days,
          position:       line.position,
          vesselCategory: form.vesselCategory || null,
          maintenance:    form.maintenance,
          rates:          ratesData.rates,
          minimums:       ratesData.minimums,
          categories:     ratesData.categories,
        })
      } catch { return null }
    }))
  }, [form.loa, form.vesselCategory, form.maintenance, lines, ratesData])

  const set = useCallback((field, value) => setForm(prev => ({ ...prev, [field]: value })), [])

  function updateLine(i, field, value) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }
  function addLine() { setLines(prev => [...prev, { ...EMPTY_LINE }]) }
  function removeLine(i) { if (lines.length > 1) setLines(prev => prev.filter((_, idx) => idx !== i)) }

  // ATA/ATD split helpers
  const ataDate = form.ata ? form.ata.split('T')[0] : ''
  const ataTime = form.ata ? (form.ata.split('T')[1] || '').slice(0, 5) : ''
  const atdDate = form.atd ? form.atd.split('T')[0] : ''
  const atdTime = form.atd ? (form.atd.split('T')[1] || '').slice(0, 5) : ''

  const setAtaDate = (v) => set('ata', v + 'T' + (ataTime || '00:00'))
  const setAtaTime = (v) => { if (ataDate) set('ata', ataDate + 'T' + v) }
  const setAtdDate = (v) => set('atd', v + 'T' + (atdTime || '00:00'))
  const setAtdTime = (v) => { if (atdDate) set('atd', atdDate + 'T' + v) }

  function validate() {
    const e = {}
    if (!form.voyageNumber.trim()) e.voyageNumber = true
    if (!form.vesselName.trim())   e.vesselName   = true
    if (!form.shippingAgent)       e.shippingAgent = true
    if (!form.ata)                 e.ata           = true
    if (!form.atd)                 e.atd           = true
    if (!form.loa || parseFloat(form.loa) <= 0) e.loa = true
    if (form.vesselType === 'RoRo' && !form.roroCargotype) e.roroCargotype = true
    if (!breakdowns.some(b => b !== null)) e.lines = true
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSaveClick() {
    if (!validate()) return
    setShowConfirm(true)
  }

  async function handleConfirm() {
    setSaving(true)
    setShowConfirm(false)

    const voyageNumber = form.voyageNumber.trim()
    if (form.vesselName.trim()) window.api.berthingSaveShipName(form.vesselName.trim())
    const validPairs = lines
      .map((line, i) => ({ line, bd: breakdowns[i] }))
      .filter(({ line, bd }) => line.position && bd)

    const commonPayload = {
      voyage_number:   voyageNumber,
      bill_number:     voyageNumber,
      vessel_name:     form.vesselName.trim(),
      vessel_type:     form.vesselType || null,
      roro_cargo_type: form.vesselType === 'RoRo' ? (form.roroCargotype || null) : null,
      flag:            form.flag || null,
      shipping_agent:  form.shippingAgent,
      ata:             form.ata,
      atd:             form.atd,
      loa:             parseFloat(form.loa),
      vessel_category: form.vesselCategory || null,
      maintenance:     form.maintenance,
    }

    try {
      if (isEditing) {
        const existing = await window.api.berthingGetByVoyage(voyageNumber)
        const existingRows = existing.success ? existing.data : []

        for (let i = 0; i < validPairs.length; i++) {
          const { line, bd } = validPairs[i]
          const payload = buildLinePayload(commonPayload, line, bd)
          if (existingRows[i]) {
            const r = await window.api.updateBerthing(existingRows[i].id, { ...payload, updated_by: session.id })
            if (!r.success) throw new Error(r.error)
          } else {
            const r = await window.api.saveBerthing({ ...payload, created_by: session.id })
            if (!r.success) throw new Error(r.error)
          }
        }
        // Soft-delete any surplus rows removed from the form
        for (let i = validPairs.length; i < existingRows.length; i++) {
          await window.api.deleteBerthing(existingRows[i].id, session.id)
        }
        showToast(t('record_updated'), 'success')
        onSaved()
      } else {
        for (const { line, bd } of validPairs) {
          const r = await window.api.saveBerthing({ ...buildLinePayload(commonPayload, line, bd), created_by: session.id })
          if (!r.success) throw new Error(r.error)
        }
        setPostSaveVoyage(voyageNumber)
        setPostSaveVesselType(form.vesselType)
      }
    } catch (err) {
      showToast(err.message || 'Error', 'error')
    } finally {
      setSaving(false)
    }
  }

  function buildLinePayload(common, line, bd) {
    return {
      ...common,
      days:               Math.ceil(Number(line.days)),
      position:           line.position,
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
  }

  async function handleClear() {
    const hasData = Object.values(form).some(v => v !== '' && v !== 'No') || lines.some(l => l.position || l.days)
    if (hasData) {
      const ok = await window.api.dialogConfirm({ title: t('clear_form'), message: t('confirm_clear') })
      if (!ok) return
    }
    doClear()
  }

  function doClear() {
    setForm(EMPTY_FORM)
    setLines([{ ...EMPTY_LINE }])
    setBreakdowns([null])
    setErrors({})
    setVoyageWarn(null)
    if (isEditing) onCancelEdit()
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function clearUncertain(fieldName) {
    setUncertainFields(prev => {
      if (!prev.has(fieldName)) return prev
      const next = new Set(prev)
      next.delete(fieldName)
      return next
    })
  }

  function handleImportExtracted({ fields, uncertain, error }) {
    if (error) { showToast(error, 'error'); return }
    if (!fields) return

    function toDateInput(ddmmyyyy) {
      if (!ddmmyyyy) return ''
      const p = String(ddmmyyyy).split('/')
      if (p.length !== 3) return ''
      return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00`
    }

    setForm(prev => ({
      ...prev,
      ...(fields.voyage_number  != null && { voyageNumber:  String(fields.voyage_number) }),
      ...(fields.vessel_name    != null && { vesselName:    String(fields.vessel_name) }),
      ...(fields.vessel_type    != null && { vesselType:    String(fields.vessel_type) }),
      ...(fields.flag           != null && { flag:          String(fields.flag) }),
      ...(fields.shipping_agent != null && { shippingAgent: String(fields.shipping_agent) }),
      ...(fields.loa            != null && { loa:           String(fields.loa) }),
      ...(fields.ata            != null && { ata:           toDateInput(fields.ata) }),
      ...(fields.atd            != null && { atd:           toDateInput(fields.atd) }),
    }))

    if (fields.berthing && fields.berthing.length > 0) {
      const newLines = fields.berthing
        .filter(b => !FREE_POSITIONS.has(String(b.position || '').toUpperCase()))
        .map(b => ({ position: normalizePos(b.position), days: b.days != null ? String(Math.ceil(Number(b.days))) : '' }))
        .filter(l => l.position)
      if (newLines.length > 0) setLines(newLines)
    }

    if (uncertain) setUncertainFields(uncertain)
    showToast(t('import_applied'), 'success')
  }

  // Enter confirms, Escape cancels the confirmation modal
  useEffect(() => {
    if (!showConfirm) return
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); handleConfirm() }
      if (e.key === 'Escape') { e.preventDefault(); setShowConfirm(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfirm])

  const fieldStyle = (err, unc) => ({
    width: '100%', height: 44, padding: '0 12px',
    border: `1px solid ${err ? 'var(--color-danger)' : unc ? '#F59E0B' : 'var(--color-border)'}`,
    borderRadius: 6, fontSize: 14, outline: 'none',
    background: unc ? '#FFFBEB' : 'white',
    boxSizing: 'border-box',
  })
  const UncWarn = ({ field }) => uncertainFields.has(field) ? (
    <span title={t('import_uncertain_tooltip')} style={{ color: '#F59E0B', marginInlineStart: 5, fontSize: 13 }}>⚠</span>
  ) : null
  const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }
  const groupStyle = { marginBottom: 20 }
  const twoCol    = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }
  const uf = (field) => ({ onFocus: () => clearUncertain(field), onClick: () => clearUncertain(field) })

  const validBreakdowns = breakdowns.filter(b => b !== null)
  const hasAnyBreakdown = validBreakdowns.length > 0
  const totalFee        = validBreakdowns.reduce((s, b) => s + b.finalFee, 0)

  return (
    <div style={{ background: 'white', borderRadius: 8, padding: 28, border: '1px solid var(--color-border)', maxWidth: 860, marginInline: 'auto' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Voyage # */}
      <div style={groupStyle}>
        <label style={labelStyle}>{t('voyage_number')} * <UncWarn field="voyage_number" /></label>
        <input style={fieldStyle(errors.voyageNumber, uncertainFields.has('voyage_number'))} type="text"
          value={form.voyageNumber}
          onChange={e => { set('voyageNumber', e.target.value); setVoyageWarn(null) }}
          onBlur={async (e) => {
            const vn = e.target.value.trim()
            if (!vn || isEditing) return
            const res = await window.api.berthingVoyageExists(vn)
            setVoyageWarn(res.success && res.exists ? vn : null)
          }}
          {...uf('voyage_number')} />
        {voyageWarn && (
          <div style={{ marginTop: 5, fontSize: 12, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}>
            ⚠ {t('voyage_duplicate_warning', { number: voyageWarn })}
          </div>
        )}
      </div>

      {/* Vessel Name + Type */}
      <div style={twoCol}>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('vessel_name')} * <UncWarn field="vessel_name" /></label>
          <input list="ships-datalist" style={fieldStyle(errors.vesselName, uncertainFields.has('vessel_name'))} type="text"
            value={form.vesselName}
            onChange={e => {
              const name = e.target.value
              set('vesselName', name)
              const match = ships.find(s => s.name.toLowerCase() === name.toLowerCase())
              if (match && match.loa != null && !form.loa) set('loa', String(match.loa))
            }}
            {...uf('vessel_name')} />
          <datalist id="ships-datalist">
            {ships.map(s => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('vessel_type')} <UncWarn field="vessel_type" /></label>
          <select style={{ ...fieldStyle(false, uncertainFields.has('vessel_type')), cursor: 'pointer' }}
            value={form.vesselType}
            onChange={e => {
              const v = e.target.value
              setForm(prev => ({ ...prev, vesselType: v, ...(v !== 'RoRo' && { roroCargotype: '' }) }))
              clearUncertain('vessel_type')
            }}>
            <option value="">—</option>
            {VESSEL_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}
          </select>
        </div>
      </div>

      {form.vesselType === 'RoRo' && (
        <div style={groupStyle}>
          <label style={labelStyle}>{t('roro_cargo_type')} *</label>
          <select style={{ ...fieldStyle(errors.roroCargotype, false), cursor: 'pointer', maxWidth: 320 }}
            value={form.roroCargotype} onChange={e => set('roroCargotype', e.target.value)}>
            <option value="">—</option>
            <option value="General Cargo">{t('general_cargo')}</option>
            <option value="Containers">{t('containers')}</option>
          </select>
        </div>
      )}

      {/* Flag + Agent */}
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

      {/* ATA + ATD */}
      <div style={twoCol}>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('ata')} * <UncWarn field="ata" /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={ataDate}
              onChange={e => setAtaDate(e.target.value)}
              onBlur={e => { const f = expandDateYear(e.target.value); if (f !== e.target.value) setAtaDate(f) }}
              style={{ ...fieldStyle(errors.ata, uncertainFields.has('ata')), flex: '1.5 1 0' }} {...uf('ata')} />
            <input type="time" value={ataTime} onChange={e => setAtaTime(e.target.value)}
              style={{ ...fieldStyle(errors.ata, uncertainFields.has('ata')), flex: '1 1 0' }} {...uf('ata')} />
          </div>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('atd')} * <UncWarn field="atd" /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={atdDate}
              onChange={e => setAtdDate(e.target.value)}
              onBlur={e => { const f = expandDateYear(e.target.value); if (f !== e.target.value) setAtdDate(f) }}
              style={{ ...fieldStyle(errors.atd, uncertainFields.has('atd')), flex: '1.5 1 0' }} {...uf('atd')} />
            <input type="time" value={atdTime} onChange={e => setAtdTime(e.target.value)}
              style={{ ...fieldStyle(errors.atd, uncertainFields.has('atd')), flex: '1 1 0' }} {...uf('atd')} />
          </div>
        </div>
      </div>

      {/* LOA + Category + Maintenance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <label style={labelStyle}>{t('loa')} * <UncWarn field="loa" /></label>
          <input style={fieldStyle(errors.loa, uncertainFields.has('loa'))} type="number" min="0" step="0.01"
            value={form.loa} onChange={e => set('loa', e.target.value)} {...uf('loa')} />
        </div>
        <div>
          <label style={labelStyle}>{t('vessel_category')}</label>
          <select style={{ ...fieldStyle(false), cursor: 'pointer' }}
            value={form.vesselCategory} onChange={e => set('vesselCategory', e.target.value)}>
            <option value="">{t('none')}</option>
            {VESSEL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>{t('maintenance')}</label>
          <select style={{ ...fieldStyle(false), cursor: 'pointer' }}
            value={form.maintenance} onChange={e => set('maintenance', e.target.value)}>
            <option value="No">{t('no')}</option>
            <option value="Yes">{t('yes')}</option>
          </select>
        </div>
      </div>

      {/* ── Berthing Lines ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 10 }}>
          {t('berthing_lines_label')}
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 36px', gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{t('position')}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{t('days')}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{t('total_fee')}</div>
          <div />
        </div>

        {lines.map((line, i) => {
          const bd = breakdowns[i]
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 36px', gap: 10, marginBottom: 8, alignItems: 'center' }}>
              <select value={line.position} onChange={e => updateLine(i, 'position', e.target.value)}
                style={{ ...fieldStyle(false), height: 40, cursor: 'pointer' }}>
                <option value="">{t('select_placeholder')}</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="number" min="1" step="1" value={line.days}
                onChange={e => updateLine(i, 'days', e.target.value)}
                style={{ ...fieldStyle(false), height: 40 }} />
              <div style={{
                height: 40, display: 'flex', alignItems: 'center', paddingInlineStart: 4,
                gap: 6, flexWrap: 'wrap',
              }}>
                {bd ? (
                  <>
                    <span className="num-ltr" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-primary)' }}>
                      {'$' + bd.finalFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {bd.discountFactor < 1 && (
                      <span style={{ fontSize: 11, color: '#27ae60', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {Math.round((1 - bd.discountFactor) * 100)}% off
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>—</span>
                )}
              </div>
              <button onClick={() => removeLine(i)} disabled={lines.length <= 1}
                title={t('remove_berthing_line')}
                style={{
                  height: 36, width: 36, borderRadius: 6, border: '1px solid var(--color-border)',
                  background: lines.length <= 1 ? '#F5F5F5' : 'white',
                  color: lines.length <= 1 ? '#ccc' : 'var(--color-danger)',
                  cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                🗑
              </button>
            </div>
          )
        })}

        <button onClick={addLine} style={{
          marginTop: 4, padding: '7px 16px', borderRadius: 6,
          border: '1px dashed var(--color-border)', background: 'transparent',
          color: 'var(--color-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          + {t('add_berthing_line')}
        </button>

        {/* Combined fee preview */}
        {hasAnyBreakdown && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 6,
            background: '#F8FAFF', border: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t('berthing_total_preview')}
              <span style={{ fontSize: 11, marginInlineStart: 6, color: '#9CA3AF' }}>
                ({t('berthing_min_note')})
              </span>
            </span>
            <span className="num-ltr" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
              ${totalFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {errors.lines && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-danger)' }}>
            {t('required_fields_missing')}
          </div>
        )}
      </div>
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* Validation error banner (non-lines errors) */}
      {Object.keys(errors).filter(k => k !== 'lines').length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 6, background: '#FEF2F2', color: 'var(--color-danger)', fontSize: 13, marginBottom: 16 }}>
          {t('required_fields_missing')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <button onClick={handleSaveClick} disabled={saving || !hasAnyBreakdown}
          style={{
            padding: '12px 28px', borderRadius: 6, border: 'none',
            background: (!hasAnyBreakdown || saving) ? '#B0BEC5' : 'var(--color-primary)',
            color: 'white', fontSize: 14, fontWeight: 600,
            cursor: (!hasAnyBreakdown || saving) ? 'not-allowed' : 'pointer',
          }}>
          {saving ? '...' : t('save_record')}
        </button>
        <button onClick={handleClear}
          style={{ padding: '12px 24px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 14, cursor: 'pointer' }}>
          {t('clear_form')}
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'white', borderRadius: 10, width: 500, maxHeight: '80vh', boxShadow: '0 12px 48px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '28px 28px 0', overflowY: 'auto', flex: 1 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>
                {isEditing ? t('edit') : t('confirm_save')}
              </h3>
              <div style={{ marginBottom: 16, fontSize: 13 }}>
                {[
                  [t('voyage_number'),   form.voyageNumber],
                  [t('vessel_name'),     form.vesselName],
                  [t('shipping_agent'),  form.shippingAgent],
                  [t('ata'),             form.ata],
                  [t('atd'),             form.atd],
                  [t('loa'),             `${form.loa} m`],
                  [t('vessel_category'), form.vesselCategory || t('none')],
                  [t('maintenance'),     t(form.maintenance === 'Yes' ? 'yes' : 'no')],
                  ...(form.vesselType === 'RoRo' && form.roroCargotype ? [[t('roro_cargo_type'), form.roroCargotype]] : []),
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F0F0F0' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                    <span className="num-ltr" style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Lines table */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('berthing_lines_label')}
                </div>
                {lines.map((line, i) => {
                  const bd = breakdowns[i]
                  if (!line.position || !bd) return null
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', marginBottom: 4, background: '#F8FAFF', borderRadius: 6 }}>
                      <span style={{ fontWeight: 500, minWidth: 80 }}>{line.position}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{line.days} {t('days')}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {bd.discountFactor < 1 && (
                          <span className="num-ltr" style={{ fontSize: 11, color: '#9CA3AF', textDecoration: 'line-through' }}>
                            ${bd.rawFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                        <span className="num-ltr" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                          ${bd.finalFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </span>
                    </div>
                  )
                })}
                {hasAnyBreakdown && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F0F4FF', borderRadius: 6, marginTop: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 13 }}>{t('total_fee')}</span>
                    <span className="num-ltr" style={{ fontWeight: 700, fontSize: 20, color: 'var(--color-primary)' }}>
                      ${totalFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #F0F0F0' }}>
              <button onClick={() => setShowConfirm(false)} style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>
                {t('go_back')}
              </button>
              <button onClick={handleConfirm} style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                {t('confirm_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-save: offer to open cargo services */}
      {postSaveVoyage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'white', borderRadius: 10, width: 420, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '28px 28px 20px' }}>
              <div style={{ fontSize: 22, marginBottom: 12 }}>✅</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>{t('record_saved')}</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                {(postSaveVesselType === 'General Cargo' || postSaveVesselType === 'Petrolien') ? t('open_gc_prompt') : t('open_containers_prompt')}
                {' '}
                <strong style={{ color: 'var(--color-primary)' }}>{postSaveVoyage}</strong>?
              </p>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #F0F0F0', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setPostSaveVoyage(null); setPostSaveVesselType(null)
                  setForm(EMPTY_FORM); setLines([{ ...EMPTY_LINE }]); setBreakdowns([null]); setErrors({})
                }}
                style={{ padding: '10px 20px', borderRadius: 6, fontSize: 14, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>
                + {t('new_entry')}
              </button>
              <button
                onClick={async () => {
                  const vn = postSaveVoyage
                  setPostSaveVoyage(null); setPostSaveVesselType(null)
                  const res = await window.api.receiptPrepareBerthingOnly(vn, session.username)
                  if (!res.success) { showToast(res.error || 'Error', 'error'); return }
                  onGenerateReceipt?.(vn)
                }}
                style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid var(--color-primary)', fontSize: 14, background: 'white', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
                🧾 {t('generate_receipt')}
              </button>
              {(postSaveVesselType === 'General Cargo' || postSaveVesselType === 'Petrolien') ? (
                <button
                  onClick={() => { const vn = postSaveVoyage; setPostSaveVoyage(null); setPostSaveVesselType(null); onGoToGeneralCargo?.(vn) }}
                  style={{ padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 14, background: 'var(--color-primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                  🚢 {t('open_gc_services')}
                </button>
              ) : (
                <button
                  onClick={() => { const vn = postSaveVoyage; setPostSaveVoyage(null); setPostSaveVesselType(null); onGoToContainers?.(vn) }}
                  style={{ padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 14, background: 'var(--color-primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                  📦 {t('open_container_services')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
