import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { useSession } from '../../context/SessionContext.jsx'
import { calcBerthingFee } from '../../logic/berthingCalc.js'
import SearchableSelect from '../../components/SearchableSelect.jsx'
import FeePreview from '../../components/FeePreview.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import { COUNTRIES } from '../../data/countries.js'

const POSITIONS = ['Quay', 'P2', 'En Rade', 'Congestion']
const VESSEL_CATEGORIES = [
  'Lebanese', 'Wooden Coasters', 'Sailboats', 'Passenger', 'Tourist',
  'Ro-Ro', 'Military', 'Lebanese Government (Non-Commercial)',
]
const VESSEL_TYPES = ['Container', 'General Cargo', 'RoRo', 'Petrolien']

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

const EMPTY = {
  voyageNumber: '', vesselName: '', vesselType: '', roroCargotype: '',
  flag: '', shippingAgent: '', ata: '', atd: '',
  loa: '', days: '', position: '', vesselCategory: '', maintenance: 'No',
}

export default function BerthingForm({ editRecord, onSaved, onCancelEdit, onGoToContainers, onGoToGeneralCargo, initialVoyageNumber }) {
  const { t } = useTranslation()
  const { session, ratesData, agents } = useSession()

  const [form, setForm]               = useState(EMPTY)
  const [breakdown, setBreakdown]     = useState(null)
  const [errors, setErrors]           = useState({})
  const [showConfirm, setShowConfirm]           = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [postSaveVoyage, setPostSaveVoyage]         = useState(null)
  const [postSaveVesselType, setPostSaveVesselType] = useState(null)
  const [saving, setSaving]                     = useState(false)
  const [toast, setToast]                       = useState(null)
  const [uncertainFields, setUncertainFields]   = useState(new Set())
  const isEditing = !!editRecord

  // Populate form in edit mode
  useEffect(() => {
    if (editRecord) {
      setForm({
        voyageNumber:   editRecord.voyage_number,
        vesselName:     editRecord.vessel_name,
        vesselType:     editRecord.vessel_type || '',
        roroCargotype:  editRecord.roro_cargo_type || '',
        flag:           editRecord.flag || '',
        shippingAgent:  editRecord.shipping_agent,
        ata:            toDatetimeLocal(editRecord.ata),
        atd:            toDatetimeLocal(editRecord.atd),
        loa:            String(editRecord.loa),
        days:           String(editRecord.days),
        position:       editRecord.position,
        vesselCategory: editRecord.vessel_category || '',
        maintenance:    editRecord.maintenance,
      })
    } else {
      setForm({ ...EMPTY, voyageNumber: initialVoyageNumber || '' })
    }
    setErrors({})
    setBreakdown(null)
  }, [editRecord, initialVoyageNumber])

  // Live fee calc — triggered by LOA, Days, Position, Category, Maintenance
  useEffect(() => {
    if (!ratesData) return
    const loa  = parseFloat(form.loa)
    const days = Math.ceil(Number(form.days))
    if (!loa || loa <= 0 || !days || days <= 0 || !form.position) {
      setBreakdown(null)
      return
    }
    try {
      const result = calcBerthingFee({
        loa, days,
        position:       form.position,
        vesselCategory: form.vesselCategory || null,
        maintenance:    form.maintenance,
        rates:          ratesData.rates,
        minimums:       ratesData.minimums,
        categories:     ratesData.categories,
      })
      setBreakdown(result)
    } catch {
      setBreakdown(null)
    }
  }, [form.loa, form.days, form.position, form.vesselCategory, form.maintenance, ratesData])

  const set = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  // ATA split helpers
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
    if (!form.days || Math.ceil(Number(form.days)) <= 0) e.days = true
    if (!form.position)            e.position      = true
    if (form.vesselType === 'RoRo' && !form.roroCargotype) e.roroCargotype = true
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSaveClick() {
    if (!validate()) return
    if (!breakdown) return
    setShowConfirm(true)
  }

  async function handleConfirm() {
    setSaving(true)
    setShowConfirm(false)
    const days = Math.ceil(Number(form.days))
    const payload = {
      voyage_number:      form.voyageNumber.trim(),
      bill_number:        form.voyageNumber.trim(),
      vessel_name:        form.vesselName.trim(),
      vessel_type:        form.vesselType || null,
      roro_cargo_type:    form.vesselType === 'RoRo' ? (form.roroCargotype || null) : null,
      flag:               form.flag || null,
      shipping_agent:     form.shippingAgent,
      ata:                form.ata,
      atd:                form.atd,
      loa:                parseFloat(form.loa),
      days,
      position:           form.position,
      vessel_category:    form.vesselCategory || null,
      maintenance:        form.maintenance,
      l_index:            breakdown.lIndex,
      d1_days:            breakdown.d1Days,
      d2_days:            breakdown.d2Days,
      d3_days:            breakdown.d3Days,
      raw_fee:            breakdown.rawFee,
      discount_factor:    breakdown.discountFactor,
      fee_after_discount: breakdown.feeAfterDiscount,
      min_fee:            breakdown.minFee,
      late_fee:           0,
      maintenance_fee:    breakdown.maintenanceFee,
      final_fee:          breakdown.finalFee,
    }
    try {
      let res
      if (isEditing) {
        res = await window.api.updateBerthing(editRecord.id, { ...payload, updated_by: session.id })
      } else {
        res = await window.api.saveBerthing({ ...payload, created_by: session.id })
      }
      if (res.success) {
        if (isEditing) {
          showToast(t('record_updated'), 'success')
          onSaved()
        } else {
          setPostSaveVoyage(form.voyageNumber.trim())
          setPostSaveVesselType(form.vesselType)
        }
      } else {
        showToast(res.error || 'Error', 'error')
      }
    } catch (err) {
      showToast(err.message || 'Error', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleClear() {
    const hasData = Object.values(form).some(v => v !== '' && v !== 'No')
    if (hasData) { setShowClearConfirm(true); return }
    doClear()
  }

  function doClear() {
    setShowClearConfirm(false)
    setForm(EMPTY)
    setBreakdown(null)
    setErrors({})
    if (isEditing) onCancelEdit()
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Clear a field from uncertainty when the user interacts with it
  function clearUncertain(fieldName) {
    setUncertainFields(prev => {
      if (!prev.has(fieldName)) return prev
      const next = new Set(prev)
      next.delete(fieldName)
      return next
    })
  }

  // Handle extracted data from DocumentImport
  function handleImportExtracted({ fields, uncertain, error }) {
    if (error) { showToast(error, 'error'); return }
    if (!fields) return

    // Convert DD/MM/YYYY → yyyy-MM-ddT00:00
    function toDateInput(ddmmyyyy) {
      if (!ddmmyyyy) return ''
      const p = String(ddmmyyyy).split('/')
      if (p.length !== 3) return ''
      return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00`
    }

    setForm(prev => ({
      ...prev,
      ...(fields.voyage_number    != null && { voyageNumber:  String(fields.voyage_number) }),
      ...(fields.vessel_name      != null && { vesselName:    String(fields.vessel_name) }),
      ...(fields.vessel_type      != null && { vesselType:    String(fields.vessel_type) }),
      ...(fields.flag             != null && { flag:          String(fields.flag) }),
      ...(fields.shipping_agent   != null && { shippingAgent: String(fields.shipping_agent) }),
      ...(fields.loa              != null && { loa:           String(fields.loa) }),
      ...(fields.ata              != null && { ata:           toDateInput(fields.ata) }),
      ...(fields.atd              != null && { atd:           toDateInput(fields.atd) }),
      // Berthing position + days from first berthing row if present
      ...(fields.berthing?.[0]?.position != null && (() => {
        const raw     = String(fields.berthing[0].position)
        const matched = POSITIONS.find(p => p.toLowerCase() === raw.toLowerCase())
        return matched ? { position: matched } : {}
      })()),
      ...(fields.berthing?.[0]?.days     != null && { days:     String(Math.ceil(Number(fields.berthing[0].days))) }),
    }))

    if (uncertain) setUncertainFields(uncertain)
    showToast(t('import_applied'), 'success')
  }

  // Enter confirms, Escape cancels the save confirmation modal
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
  const labelStyle = {
    fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)',
    display: 'block', marginBottom: 4,
  }
  const groupStyle = { marginBottom: 20 }
  const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

  // Helper: onFocus/onClick that clears the uncertain state for a field
  const uf = (field) => ({ onFocus: () => clearUncertain(field), onClick: () => clearUncertain(field) })

  return (
    <div style={{ background: 'white', borderRadius: 8, padding: 28, border: '1px solid var(--color-border)', maxWidth: 860, marginInline: 'auto' }}>

      {/* Toast */}
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

      {/* Import button */}

      {/* Row 1: Voyage # */}
      <div style={groupStyle}>
        <label style={labelStyle}>{t('voyage_number')} * <UncWarn field="voyage_number" /></label>
        <input style={fieldStyle(errors.voyageNumber, uncertainFields.has('voyage_number'))} type="text"
          value={form.voyageNumber} onChange={e => set('voyageNumber', e.target.value)}
          {...uf('voyage_number')} />
      </div>

      {/* Row 2: Vessel Name and Vessel Type */}
      <div style={twoCol}>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('vessel_name')} * <UncWarn field="vessel_name" /></label>
          <input style={fieldStyle(errors.vesselName, uncertainFields.has('vessel_name'))} type="text"
            value={form.vesselName} onChange={e => set('vesselName', e.target.value)}
            {...uf('vessel_name')} />
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

      {/* RoRo Cargo Type — shown only when vessel type is RoRo */}
      {form.vesselType === 'RoRo' && (
        <div style={groupStyle}>
          <label style={labelStyle}>{t('roro_cargo_type')} *</label>
          <select
            style={{ ...fieldStyle(errors.roroCargotype, false), cursor: 'pointer', maxWidth: 320 }}
            value={form.roroCargotype}
            onChange={e => set('roroCargotype', e.target.value)}
          >
            <option value="">—</option>
            <option value="General Cargo">{t('general_cargo')}</option>
            <option value="Containers">{t('containers')}</option>
          </select>
        </div>
      )}

      {/* Row 3: Flag and Shipping Agent */}
      <div style={twoCol}>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('flag')} <UncWarn field="flag" /></label>
          <div style={{ outline: uncertainFields.has('flag') ? '1px solid #F59E0B' : 'none', borderRadius: 6, background: uncertainFields.has('flag') ? '#FFFBEB' : 'transparent' }}
            {...uf('flag')}>
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

      {/* Row 4: ATA and ATD */}
      <div style={twoCol}>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('ata')} * <UncWarn field="ata" /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={ataDate}
              onChange={e => setAtaDate(e.target.value)}
              onBlur={e => { const f = expandDateYear(e.target.value); if (f !== e.target.value) setAtaDate(f) }}
              style={{ ...fieldStyle(errors.ata, uncertainFields.has('ata')), flex: '1.5 1 0' }}
              {...uf('ata')} />
            <input type="time" value={ataTime}
              onChange={e => setAtaTime(e.target.value)}
              style={{ ...fieldStyle(errors.ata, uncertainFields.has('ata')), flex: '1 1 0' }}
              {...uf('ata')} />
          </div>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('atd')} * <UncWarn field="atd" /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={atdDate}
              onChange={e => setAtdDate(e.target.value)}
              onBlur={e => { const f = expandDateYear(e.target.value); if (f !== e.target.value) setAtdDate(f) }}
              style={{ ...fieldStyle(errors.atd, uncertainFields.has('atd')), flex: '1.5 1 0' }}
              {...uf('atd')} />
            <input type="time" value={atdTime}
              onChange={e => setAtdTime(e.target.value)}
              style={{ ...fieldStyle(errors.atd, uncertainFields.has('atd')), flex: '1 1 0' }}
              {...uf('atd')} />
          </div>
        </div>
      </div>

      {/* Row 5: LOA and Days */}
      <div style={twoCol}>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('loa')} * <UncWarn field="loa" /></label>
          <input style={fieldStyle(errors.loa, uncertainFields.has('loa'))} type="number" min="0" step="0.01"
            value={form.loa} onChange={e => set('loa', e.target.value)}
            {...uf('loa')} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('days')} * <UncWarn field="days" /></label>
          <input style={fieldStyle(errors.days, uncertainFields.has('days'))} type="number" min="1" step="1"
            value={form.days} onChange={e => set('days', e.target.value)}
            {...uf('days')} />
        </div>
      </div>

      {/* Row 6: Position, Vessel Category, Maintenance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div style={groupStyle}>
          <label style={labelStyle}>{t('position')} * <UncWarn field="position" /></label>
          <select style={{ ...fieldStyle(errors.position, uncertainFields.has('position')), cursor: 'pointer' }}
            value={form.position} onChange={e => set('position', e.target.value)}
            {...uf('position')}>
            <option value="">{t('select_placeholder')}</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
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

      {/* Fee Preview */}
      {breakdown && (
        <div style={{ marginBottom: 24 }}>
          <FeePreview breakdown={breakdown} />
        </div>
      )}

      {/* Validation error banner */}
      {Object.keys(errors).length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, background: '#FEF2F2',
          color: 'var(--color-danger)', fontSize: 13, marginBottom: 16,
        }}>
          {t('required_fields_missing')}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <button
          onClick={handleSaveClick}
          disabled={saving || !breakdown}
          style={{
            padding: '12px 28px', borderRadius: 6, border: 'none',
            background: (!breakdown || saving) ? '#B0BEC5' : 'var(--color-primary)',
            color: 'white', fontSize: 14, fontWeight: 600,
            cursor: (!breakdown || saving) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '...' : t('save_record')}
        </button>
        <button
          onClick={handleClear}
          style={{
            padding: '12px 24px', borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'white', fontSize: 14, cursor: 'pointer',
          }}
        >
          {t('clear_form')}
        </button>
      </div>

      {/* Clear-form confirmation */}
      {showClearConfirm && (
        <ConfirmDialog
          title={t('clear_form')}
          message={t('confirm_clear')}
          confirmLabel={t('clear_form')}
          cancelLabel={t('cancel')}
          danger
          onConfirm={doClear}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {/* Confirmation modal */}
      {showConfirm && breakdown && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10,
            width: 480, maxHeight: '80vh',
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Scrollable body — data rows only */}
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
                  [t('days'),            form.days],
                  [t('position'),        form.position],
                  [t('vessel_category'), form.vesselCategory || t('none')],
                  [t('maintenance'),     t(form.maintenance === 'Yes' ? 'yes' : 'no')],
                  ...(form.vesselType === 'RoRo' && form.roroCargotype
                    ? [[t('roro_cargo_type'), form.roroCargotype]] : []),
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '5px 0', borderBottom: '1px solid #F0F0F0',
                  }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                    <span className="num-ltr" style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Final total only — no full breakdown */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', marginBottom: 8,
                background: '#F8FAFF', borderRadius: 8, border: '1px solid var(--color-border)',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 14 }}>
                  {t('total_fee')}
                </span>
                <span className="num-ltr" style={{ fontWeight: 700, fontSize: 22, color: 'var(--color-primary)' }}>
                  ${breakdown.finalFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Buttons — outside scroll, always visible */}
            <div style={{
              padding: '16px 28px 24px',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              borderTop: '1px solid #F0F0F0',
            }}>
              <button onClick={() => setShowConfirm(false)} style={{
                padding: '10px 20px', borderRadius: 6,
                border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer',
              }}>
                {t('go_back')}
              </button>
              <button onClick={handleConfirm} style={{
                padding: '10px 24px', borderRadius: 6, border: 'none',
                background: 'var(--color-primary)', color: 'white',
                fontWeight: 600, cursor: 'pointer',
              }}>
                {t('confirm_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-save: offer to open the relevant cargo services */}
      {postSaveVoyage && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, width: 420,
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
          }}>
            <div style={{ padding: '28px 28px 20px' }}>
              <div style={{ fontSize: 22, marginBottom: 12 }}>✅</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>
                {t('record_saved')}
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                {postSaveVesselType === 'General Cargo' ? t('open_gc_prompt') : t('open_containers_prompt')}
                {' '}
                <strong style={{ color: 'var(--color-primary)' }}>{postSaveVoyage}</strong>?
              </p>
            </div>
            <div style={{
              padding: '16px 28px 24px',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              borderTop: '1px solid #F0F0F0',
            }}>
              <button
                onClick={() => { setPostSaveVoyage(null); setPostSaveVesselType(null); setForm(EMPTY); setBreakdown(null); setErrors({}) }}
                style={{
                  padding: '10px 20px', borderRadius: 6, fontSize: 14,
                  border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer',
                }}
              >
                + {t('new_entry')}
              </button>
              {postSaveVesselType === 'General Cargo' ? (
                <button
                  onClick={() => { const vn = postSaveVoyage; setPostSaveVoyage(null); setPostSaveVesselType(null); onGoToGeneralCargo?.(vn) }}
                  style={{
                    padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 14,
                    background: 'var(--color-primary)', color: 'white',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  🚢 {t('open_gc_services')}
                </button>
              ) : (
                <button
                  onClick={() => { const vn = postSaveVoyage; setPostSaveVoyage(null); setPostSaveVesselType(null); onGoToContainers?.(vn) }}
                  style={{
                    padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 14,
                    background: 'var(--color-primary)', color: 'white',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
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
