import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { useSession } from '../../context/SessionContext.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'

function fmtDate(str) {
  if (!str) return '—'
  try { return format(parseISO(str), 'dd/MM/yyyy HH:mm') } catch { return str }
}

function fmtMoney(n) {
  if (n === null || n === undefined) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const NUMERIC_COLS = new Set(['loa', 'days', 'final_fee', 'id'])

function compareRows(a, b, col, dir) {
  let av = a[col], bv = b[col]
  if (NUMERIC_COLS.has(col)) {
    av = Number(av) || 0
    bv = Number(bv) || 0
    return dir === 'asc' ? av - bv : bv - av
  }
  av = (av || '').toString().toLowerCase()
  bv = (bv || '').toString().toLowerCase()
  const cmp = av.localeCompare(bv)
  return dir === 'asc' ? cmp : -cmp
}

const thBase = {
  padding: '9px 12px', textAlign: 'start', fontSize: 12,
  fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
  borderBottom: '2px solid var(--color-border)',
  background: '#F8FAFF', cursor: 'pointer', userSelect: 'none',
  textTransform: 'uppercase', letterSpacing: '0.03em',
}
const tdBase = {
  padding: '9px 12px', fontSize: 13,
  borderBottom: '1px solid #F0F2F5', whiteSpace: 'nowrap',
  color: 'var(--color-text)',
}

export default function BerthingRecords({ onEdit, onGenerateReceipt }) {
  const { t } = useTranslation()
  const { session } = useSession()
  const [records, setRecords]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast]               = useState(null)
  const [sortCol, setSortCol]           = useState('id')
  const [sortDir, setSortDir]           = useState('desc')
  const [preparingReceipt, setPreparingReceipt] = useState(null)

  useEffect(() => { loadRecords() }, [])

  async function loadRecords() {
    setLoading(true)
    try {
      const res = await window.api.getBerthingRecords()
      if (res.success) setRecords(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function canEdit(record) {
    return session.role === 'admin' || record.created_by === session.id
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const res = await window.api.deleteBerthing(deleteTarget.id, session.id)
    setDeleteTarget(null)
    if (res.success) {
      showToast(t('record_deleted'), 'success')
      await loadRecords()
    } else {
      showToast(res.error || 'Error', 'error')
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleGenerateReceipt(voyageNumber) {
    setPreparingReceipt(voyageNumber)
    const res = await window.api.receiptPrepareBerthingOnly(voyageNumber, session.username)
    setPreparingReceipt(null)
    if (!res.success) { showToast(res.error || 'Error', 'error'); return }
    onGenerateReceipt(voyageNumber)
  }

  function handleSortCol(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function sortIcon(col) {
    if (sortCol !== col) return <span style={{ opacity: 0.3 }}> ⇅</span>
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const filtered = records.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.vessel_name?.toLowerCase().includes(q) ||
      r.voyage_number?.toLowerCase().includes(q) ||
      r.bill_number?.toLowerCase().includes(q) ||
      r.shipping_agent?.toLowerCase().includes(q)
    )
  })

  const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortCol, sortDir))

  function th(col, label, extraStyle = {}) {
    return (
      <th
        onClick={() => handleSortCol(col)}
        style={{ ...thBase, ...extraStyle }}
      >
        {label}{sortIcon(col)}
      </th>
    )
  }

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, insetInlineEnd: 20, zIndex: 99999,
          background: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('delete')}
          message={t('confirm_delete')}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Search + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <input
          type="text"
          placeholder={t('search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            height: 38, padding: '0 12px', border: '1px solid var(--color-border)',
            borderRadius: 6, fontSize: 14, width: 280, outline: 'none',
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('records_count', { count: filtered.length })}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 8, border: '1px solid var(--color-border)',
          padding: 48, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14,
        }}>
          {records.length === 0 ? t('no_records') : `No results for "${search}"`}
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {th('voyage_number', t('voyage_number'))}
                {th('vessel_name',   t('vessel_name'))}
                {th('bill_number',   t('bill_number'))}
                {th('position',      t('position'))}
                {th('loa',           t('loa'),       { textAlign: 'center' })}
                {th('days',          t('days'),      { textAlign: 'end' })}
                {th('final_fee',     t('total_fee'), { textAlign: 'end' })}
                {th('ata',           t('ata'))}
                {th('atd',           t('atd'))}
                <th style={{ ...thBase, cursor: 'default', width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr
                  key={r.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdBase}>
                    <span
                      className="num-ltr"
                      onClick={() => canEdit(r) && onEdit(r)}
                      style={canEdit(r) ? { cursor: 'pointer' } : {}}
                    >
                      {r.voyage_number}
                    </span>
                  </td>
                  <td style={tdBase}>
                    <span
                      onClick={() => canEdit(r) && onEdit(r)}
                      style={canEdit(r) ? { cursor: 'pointer' } : {}}
                    >
                      {r.vessel_name}
                    </span>
                    {r.vessel_type === 'RoRo' && r.roro_cargo_type && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        RoRo — {r.roro_cargo_type}
                      </div>
                    )}
                  </td>
                  <td style={tdBase}>
                    <span className="num-ltr">{r.bill_number || '—'}</span>
                  </td>
                  <td style={tdBase}>{r.position}</td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <span className="num-ltr">{r.loa}</span>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'end' }}>
                    <span className="num-ltr">{r.days}</span>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'end', fontWeight: 600, color: 'var(--color-primary)' }}>
                    <span className="num-ltr">{fmtMoney(r.final_fee)}</span>
                  </td>
                  <td style={tdBase}><span className="num-ltr">{fmtDate(r.ata)}</span></td>
                  <td style={tdBase}><span className="num-ltr">{fmtDate(r.atd)}</span></td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {onGenerateReceipt && (
                        <button
                          onClick={() => handleGenerateReceipt(r.voyage_number)}
                          disabled={preparingReceipt === r.voyage_number}
                          style={{
                            padding: '5px 12px', borderRadius: 5,
                            border: '1px solid var(--color-primary)',
                            background: 'white', color: 'var(--color-primary)',
                            fontSize: 12, cursor: preparingReceipt === r.voyage_number ? 'default' : 'pointer',
                            fontWeight: 500, opacity: preparingReceipt === r.voyage_number ? 0.6 : 1,
                          }}
                        >
                          {preparingReceipt === r.voyage_number ? '...' : t('generate_receipt')}
                        </button>
                      )}
                      {canEdit(r) && (
                        <button
                          onClick={() => setDeleteTarget(r)}
                          style={{
                            padding: '5px 12px', borderRadius: 5,
                            border: '1px solid var(--color-danger)',
                            background: 'white', color: 'var(--color-danger)',
                            fontSize: 12, cursor: 'pointer', fontWeight: 500,
                          }}
                        >
                          {t('delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
