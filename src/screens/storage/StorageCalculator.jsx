import { useState, useEffect } from 'react'
import { useSession } from '../../context/SessionContext.jsx'
import { calculateStorage } from '../../logic/storageCalc.js'
import StorageResultCard from './StorageResultCard.jsx'

const CARGO_TYPES = [
  { value: 'vehicle',         label: 'Vehicle' },
  { value: 'vehicle_transit', label: 'Vehicle (Transit)' },
  { value: 'iron',            label: 'Iron — حديد' },
  { value: 'grain',           label: 'Bulk Grain — حبوب دكمة' },
  { value: 'container',       label: 'Container' },
  { value: 'gc',              label: 'General Cargo' },
]

const CONTAINER_STATUSES = [
  { value: 'local',   label: 'Local Consumption' },
  { value: 'transit', label: 'Transit' },
  { value: 'export',  label: 'Export' },
  { value: 'forced',  label: 'Forced' },
]
const DEFAULT_STATUSES = [
  { value: 'local',  label: 'Local Consumption' },
  { value: 'forced', label: 'Forced' },
]
const VEHICLE_SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'car',   label: 'Car / Medium' },
  { value: 'big',   label: 'Big / Large' },
]

const inputStyle = {
  background: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  color: 'var(--color-text)',
  fontSize: 14,
  padding: '0 12px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
  height: 44,
}
const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 }
const cardStyle  = { background: 'white', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24 }

function getStatusOptions(cargoType) {
  return cargoType === 'container' ? CONTAINER_STATUSES : DEFAULT_STATUSES
}

function needsTons(cargoType) {
  return ['iron', 'grain', 'gc'].includes(cargoType)
}

const EMPTY_FORM = {
  agency:        '',
  cargoType:     'vehicle',
  status:        'local',
  vehicleSize:   'car',
  containerSize: '20',
  tons:          '',
  arrivalDate:   '',
  departureDate: '',
  overrideDays:  '',
  notes:         '',
}

export default function StorageCalculator({ agents, editRecord, onSaved }) {
  const { session } = useSession()

  const [form, setForm] = useState(EMPTY_FORM)
  const [result, setResult]     = useState(null)
  const [emptyMsg, setEmptyMsg] = useState('Fill in the form to calculate the fee.')
  const [saving, setSaving]     = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg]     = useState('')

  // Pre-fill from editRecord when passed
  useEffect(() => {
    if (!editRecord) { setForm(EMPTY_FORM); setResult(null); return }
    setForm({
      agency:        editRecord.agency || '',
      cargoType:     editRecord.cargo_type || 'vehicle',
      status:        editRecord.status || 'local',
      vehicleSize:   editRecord.vehicle_size || 'car',
      containerSize: editRecord.container_size || '20',
      tons:          editRecord.tons != null ? String(editRecord.tons) : '',
      arrivalDate:   editRecord.arrival_date || '',
      departureDate: editRecord.departure_date || '',
      overrideDays:  String(editRecord.days || ''),
      notes:         editRecord.notes || '',
    })
    if (editRecord.result_json) {
      try { setResult(typeof editRecord.result_json === 'string' ? JSON.parse(editRecord.result_json) : editRecord.result_json) }
      catch { setResult(null) }
    }
  }, [editRecord])

  // Recalculate live on every input change
  useEffect(() => {
    const { cargoType, status, vehicleSize, containerSize, tons, arrivalDate, departureDate, overrideDays } = form

    let days
    if (overrideDays !== '') {
      const parsed = parseInt(overrideDays, 10)
      if (isNaN(parsed) || parsed < 0) { setResult(null); setEmptyMsg('Enter a valid number of days.'); return }
      days = parsed
    } else if (arrivalDate && departureDate) {
      const diff = Math.round((new Date(departureDate) - new Date(arrivalDate)) / 86400000)
      if (diff < 0) { setResult(null); setEmptyMsg('Departure date must be on or after the arrival date.'); return }
      days = diff
    } else {
      setResult(null); setEmptyMsg('Enter dates or override days to calculate.'); return
    }

    if (needsTons(cargoType)) {
      const t = parseFloat(tons)
      if (!tons || isNaN(t) || t <= 0) {
        setResult(null); setEmptyMsg('Enter the weight in tons to calculate the fee.'); return
      }
      setResult(calculateStorage({ cargoType, status, days, tons: t }))
    } else {
      setResult(calculateStorage({ cargoType, status, days, vehicleSize, containerSize }))
    }
    setEmptyMsg('Fill in the form to calculate the fee.')
  }, [form])

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Reset status when cargo type changes if current status is invalid for new type
      if (field === 'cargoType') {
        const validStatuses = getStatusOptions(value).map(s => s.value)
        if (!validStatuses.includes(prev.status)) next.status = 'local'
      }
      return next
    })
    setSuccessMsg('')
    setErrorMsg('')
  }

  async function handleSave() {
    if (!form.agency) { setErrorMsg('Select an agency.'); return }
    if (!result)      { setErrorMsg('Calculate a fee first.'); return }

    setSaving(true)
    setErrorMsg('')
    try {
      const payload = {
        agency:        form.agency,
        cargo_type:    form.cargoType,
        status:        form.status,
        days:          result.days,
        vehicle_size:  form.cargoType === 'vehicle' ? form.vehicleSize : null,
        container_size: form.cargoType === 'container' ? form.containerSize : null,
        tons:          needsTons(form.cargoType) ? parseFloat(form.tons) : null,
        arrival_date:  form.arrivalDate || null,
        departure_date: form.departureDate || null,
        notes:         form.notes || null,
        fee:           result.fee,
        result_json:   result,
        created_by:    session?.username || session?.id || '',
      }

      let res
      if (editRecord) {
        res = await window.api.storageUpdate(editRecord.id, payload, session?.username || session?.id)
      } else {
        res = await window.api.storageSave(payload)
      }

      if (!res.success) { setErrorMsg(res.error || 'Save failed.'); return }

      setSuccessMsg(editRecord ? 'Record updated.' : 'Record saved.')
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setForm(EMPTY_FORM)
    setResult(null)
    setSuccessMsg('')
    setErrorMsg('')
  }

  const statusOptions = getStatusOptions(form.cargoType)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
      {/* ── Left: Form ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 20 }}>
            Cargo Details
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Agency */}
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Agency</label>
              <select value={form.agency} onChange={e => set('agency', e.target.value)} style={inputStyle}>
                <option value="">Select agency…</option>
                {agents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Cargo Type */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Cargo Type</label>
              <select value={form.cargoType} onChange={e => set('cargoType', e.target.value)} style={inputStyle}>
                {CARGO_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Status */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
                {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Vehicle Size — only for vehicle (local) */}
            {form.cargoType === 'vehicle' && (
              <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Vehicle Size</label>
                <select value={form.vehicleSize} onChange={e => set('vehicleSize', e.target.value)} style={inputStyle}>
                  {VEHICLE_SIZES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </div>
            )}

            {/* Container Size — only for container */}
            {form.cargoType === 'container' && (
              <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Container Size</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {['20', '40'].map(sz => (
                    <label key={sz} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 8, padding: '10px', borderRadius: 6, cursor: 'pointer',
                      background: form.containerSize === sz ? '#EEF2FF' : 'white',
                      border: `1px solid ${form.containerSize === sz ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      color: form.containerSize === sz ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      fontSize: 14, fontWeight: form.containerSize === sz ? 600 : 400,
                    }}>
                      <input
                        type="radio" name="containerSize" value={sz}
                        checked={form.containerSize === sz}
                        onChange={() => set('containerSize', sz)}
                        style={{ display: 'none' }}
                      />
                      {sz}ft
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Weight (tons) — iron, grain, gc */}
            {needsTons(form.cargoType) && (
              <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Weight (tons)</label>
                <input
                  type="number" min="0" step="any"
                  value={form.tons}
                  onChange={e => set('tons', e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
            )}

            {/* Date of Arrival */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Date of Arrival</label>
              <input type="date" value={form.arrivalDate} onChange={e => set('arrivalDate', e.target.value)} style={inputStyle} />
            </div>

            {/* Date of Departure */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Date of Departure</label>
              <input type="date" value={form.departureDate} onChange={e => set('departureDate', e.target.value)} style={inputStyle} />
            </div>

            {/* Days Override */}
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <label style={labelStyle}>
                Days in Storage
                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 8, fontSize: 12 }}>optional — overrides date calculation</span>
              </label>
              <input
                type="number" min="0" step="1"
                value={form.overrideDays}
                onChange={e => set('overrideDays', e.target.value)}
                placeholder="Leave blank to use dates above"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={cardStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Optional notes…"
            rows={3}
            style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving || !result}
            style={{
              flex: 1, padding: '12px', borderRadius: 6, fontSize: 14, fontWeight: 600,
              cursor: saving || !result ? 'not-allowed' : 'pointer',
              background: saving || !result ? 'var(--color-bg)' : 'var(--color-primary)',
              border: `1px solid ${saving || !result ? 'var(--color-border)' : 'var(--color-primary)'}`,
              color: saving || !result ? 'var(--color-text-muted)' : 'white',
            }}
          >
            {saving ? 'Saving…' : editRecord ? 'Update Record' : 'Save Record'}
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '12px 20px', borderRadius: 6, fontSize: 14, cursor: 'pointer',
              background: 'white', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)',
            }}
          >
            Reset
          </button>
        </div>

        {successMsg && <div style={{ color: 'var(--color-success)', fontSize: 13, textAlign: 'center', fontWeight: 500 }}>{successMsg}</div>}
        {errorMsg   && <div style={{ color: 'var(--color-danger)', fontSize: 13, textAlign: 'center', fontWeight: 500 }}>{errorMsg}</div>}
      </div>

      {/* ── Right: Live result ── */}
      <div style={{ ...cardStyle, position: 'sticky', top: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 20 }}>
          Fee Breakdown
        </div>
        <StorageResultCard result={result} empty={emptyMsg} />
      </div>
    </div>
  )
}
