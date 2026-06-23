import { useState, useEffect } from 'react'
import { useSession } from '../../context/SessionContext.jsx'
import StorageResultCard from './StorageResultCard.jsx'
import { formatLocal } from '../../logic/formatDate.js'

const CARGO_LABELS = {
  vehicle:         'Vehicle',
  vehicle_transit: 'Vehicle (Transit)',
  iron:            'Iron — حديد',
  grain:           'Bulk Grain — حبوب دكمة',
  container:       'Container',
  gc:              'General Cargo',
}
const STATUS_LABELS = {
  local:   'Local Consumption',
  transit: 'Transit',
  export:  'Export',
  forced:  'Forced',
}
const fmt = n => '$' + Number(n).toFixed(2)
function fmtDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  return isNaN(d) ? str : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const thBase = {
  padding: '10px 12px', fontWeight: 600, fontSize: 12,
  color: 'var(--color-text-muted)', textAlign: 'left',
  borderBottom: '1px solid var(--color-border)',
  cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
}
const tdBase = {
  padding: '11px 12px', fontSize: 13,
  color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)',
}
const cardStyle = { background: 'white', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24 }

const SORT_KEYS = ['agency', 'cargo_type', 'status', 'days', 'fee', 'created_at', 'created_by']

export default function StorageRecords({ refreshKey, onEdit }) {
  const { session } = useSession()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState('agency')
  const [sortDir, setSortDir] = useState('asc')
  const [detail,  setDetail]  = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { load() }, [refreshKey])

  async function load() {
    setLoading(true)
    try {
      const res = await window.api.storageGetAll()
      if (res.success) setRecords(res.data)
    } finally {
      setLoading(false)
    }
  }

  function handleSort(key) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = records.filter(r =>
    r.agency.toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey]
    if (sortKey === 'fee' || sortKey === 'days') { av = Number(av); bv = Number(bv) }
    else { av = String(av ?? '').toLowerCase(); bv = String(bv ?? '').toLowerCase() }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function sortIndicator(key) {
    if (key !== sortKey) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  async function handleDelete(id) {
    if (!await window.api.dialogConfirm({ title: 'Confirm', message: 'Delete this storage record? It will be hidden but not permanently erased.' })) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await window.api.storageDelete(id, session?.username || session?.id)
      if (!res.success) { setDeleteError(res.error || 'Delete failed.'); return }
      setDetail(null)
      load()
    } finally {
      setDeleting(false)
    }
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (detail) {
    let parsedResult = null
    try { parsedResult = typeof detail.result_json === 'string' ? JSON.parse(detail.result_json) : detail.result_json } catch {}
    const canEdit   = session?.role === 'admin' || session?.role === 'manager'
    const canDelete = session?.role === 'admin'

    return (
      <div>
        <button
          onClick={() => { setDetail(null); setDeleteError('') }}
          style={{
            marginBottom: 20, padding: '8px 16px', borderRadius: 6,
            background: 'white', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13,
          }}
        >
          ← Back to Records
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Left: Record details */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Record Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Agency',         detail.agency],
                ['Cargo Type',     CARGO_LABELS[detail.cargo_type] || detail.cargo_type],
                ['Status',         STATUS_LABELS[detail.status]    || detail.status],
                ['Days in Storage', detail.days],
                detail.vehicle_size   && ['Vehicle Size',   detail.vehicle_size === 'small' ? 'Small' : detail.vehicle_size === 'car' ? 'Car / Medium' : 'Big / Large'],
                detail.container_size && ['Container Size', detail.container_size + 'ft'],
                detail.tons != null   && ['Weight (tons)',  detail.tons],
                detail.arrival_date   && ['Date of Arrival',    fmtDate(detail.arrival_date)],
                detail.departure_date && ['Date of Departure',  fmtDate(detail.departure_date)],
                detail.notes          && ['Notes',          detail.notes],
                ['Saved by',       detail.created_by],
                ['Saved at',       formatLocal(detail.created_at)],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)', minWidth: 130, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            {(canEdit || canDelete) && (
              <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
                {canEdit && (
                  <button
                    onClick={() => { setDetail(null); onEdit?.(detail) }}
                    style={{
                      padding: '9px 18px', borderRadius: 6,
                      background: 'var(--color-primary)', border: '1px solid var(--color-primary)',
                      color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Edit Record
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDelete(detail.id)}
                    disabled={deleting}
                    style={{
                      padding: '9px 18px', borderRadius: 6,
                      background: '#fef2f2', border: '1px solid #fca5a5',
                      color: 'var(--color-danger)', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: 13,
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
            )}
            {deleteError && <div style={{ marginTop: 10, color: 'var(--color-danger)', fontSize: 13 }}>{deleteError}</div>}
          </div>

          {/* Right: Fee breakdown */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Fee Breakdown
            </div>
            <StorageResultCard result={parsedResult} />
          </div>
        </div>
      </div>
    )
  }

  // ── Records list ───────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by agency…"
          style={{
            background: 'white', border: '1px solid var(--color-border)', borderRadius: 6,
            color: 'var(--color-text)', fontSize: 14, padding: '9px 14px', width: 280, outline: 'none',
          }}
        />
        {records.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {sorted.length} record{sorted.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && <div style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Loading…</div>}

      {!loading && sorted.length === 0 && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
          {records.length === 0 ? 'No storage records yet. Use the Calculator tab to add one.' : 'No records match your search.'}
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                {[
                  ['agency',     'Agency'],
                  ['cargo_type', 'Cargo Type'],
                  ['status',     'Status'],
                  ['days',       'Days'],
                  ['fee',        'Fee'],
                  ['created_at', 'Date Saved'],
                  ['created_by', 'Created By'],
                ].map(([key, label]) => (
                  <th key={key} style={thBase} onClick={() => handleSort(key)}>
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setDetail(r)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EEF2FF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdBase}>{r.agency}</td>
                  <td style={tdBase}>{CARGO_LABELS[r.cargo_type] || r.cargo_type}</td>
                  <td style={tdBase}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: r.status === 'forced' ? '#fff7ed' : '#eff6ff',
                      color: r.status === 'forced' ? '#c2410c' : 'var(--color-primary)',
                      border: `1px solid ${r.status === 'forced' ? '#fed7aa' : '#bfdbfe'}`,
                    }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ ...tdBase, direction: 'ltr' }}>{r.days}</td>
                  <td style={{ ...tdBase, direction: 'ltr', color: 'var(--color-primary)', fontWeight: 600 }}>{fmt(r.fee)}</td>
                  <td style={tdBase}>{formatLocal(r.created_at)}</td>
                  <td style={tdBase}>{r.created_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
