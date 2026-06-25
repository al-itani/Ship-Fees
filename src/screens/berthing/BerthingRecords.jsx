import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { useSession } from '../../context/SessionContext.jsx'

function fmtDate(str) {
  if (!str) return '—'
  try { return format(parseISO(str), 'dd/MM/yyyy HH:mm') } catch { return str }
}

function fmtMoney(n) {
  if (n === null || n === undefined) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const NUMERIC_COLS = new Set(['loa', 'total_fee', '_maxId'])

function compareVoyages(a, b, col, dir) {
  let av = a[col], bv = b[col]
  if (NUMERIC_COLS.has(col)) {
    av = Number(av) || 0; bv = Number(bv) || 0
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
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [toast, setToast]       = useState(null)
  const [sortCol, setSortCol]   = useState('_maxId')
  const [sortDir, setSortDir]   = useState('desc')
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

  // Group flat records by voyage_number — each voyage may have multiple position rows
  const voyages = useMemo(() => {
    const map = {}
    for (const r of records) {
      if (!map[r.voyage_number]) map[r.voyage_number] = []
      map[r.voyage_number].push(r)
    }
    return Object.values(map).map(rows => ({
      voyage_number: rows[0].voyage_number,
      vessel_name:   rows[0].vessel_name,
      vessel_type:   rows[0].vessel_type,
      roro_cargo_type: rows[0].roro_cargo_type,
      bill_number:   rows[0].bill_number,
      shipping_agent: rows[0].shipping_agent,
      ata:           rows[0].ata,
      atd:           rows[0].atd,
      loa:           rows[0].loa,
      positions:     [...new Set(rows.map(r => r.position))].join(' + '),
      total_fee:     rows.reduce((s, r) => s + (r.final_fee || 0), 0),
      created_by:    rows[0].created_by,
      _maxId:        Math.max(...rows.map(r => r.id)),
      rows,
    }))
  }, [records])

  function canEdit(voyage) {
    return session.role === 'admin'
      || session.permissions?.includes('edit_others_records')
      || voyage.rows.some(r => r.created_by === session.id)
  }

  async function handleDelete(voyage) {
    const ok = await window.api.dialogConfirm({ title: t('delete'), message: t('confirm_delete') })
    if (!ok) return
    for (const row of voyage.rows) {
      await window.api.deleteBerthing(row.id, session.id)
    }
    showToast(t('record_deleted'), 'success')
    await loadRecords()
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

  const filtered = voyages.filter(v => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      v.vessel_name?.toLowerCase().includes(q) ||
      v.voyage_number?.toLowerCase().includes(q) ||
      v.bill_number?.toLowerCase().includes(q) ||
      v.shipping_agent?.toLowerCase().includes(q)
    )
  })

  const sorted = [...filtered].sort((a, b) => compareVoyages(a, b, sortCol, sortDir))

  function th(col, label, extraStyle = {}) {
    return (
      <th onClick={() => handleSortCol(col)} style={{ ...thBase, ...extraStyle }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <input type="text" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)}
          style={{ height: 38, padding: '0 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, width: 280, outline: 'none' }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('records_count', { count: filtered.length })}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', padding: 48, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
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
                {th('positions',     t('position'))}
                {th('loa',           t('loa'),        { textAlign: 'center' })}
                {th('total_fee',     t('total_fee'),  { textAlign: 'end' })}
                {th('ata',           t('ata'))}
                {th('atd',           t('atd'))}
                <th style={{ ...thBase, cursor: 'default', width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(v => (
                <tr
                  key={v.voyage_number}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdBase}>
                    <span className="num-ltr"
                      onClick={() => canEdit(v) && onEdit(v.voyage_number)}
                      style={canEdit(v) ? { cursor: 'pointer' } : {}}>
                      {v.voyage_number}
                    </span>
                  </td>
                  <td style={tdBase}>
                    <span onClick={() => canEdit(v) && onEdit(v.voyage_number)}
                      style={canEdit(v) ? { cursor: 'pointer' } : {}}>
                      {v.vessel_name}
                    </span>
                    {v.vessel_type === 'RoRo' && v.roro_cargo_type && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        RoRo — {v.roro_cargo_type}
                      </div>
                    )}
                  </td>
                  <td style={tdBase}><span className="num-ltr">{v.bill_number || '—'}</span></td>
                  <td style={tdBase}>
                    <span style={{ fontSize: 12 }}>{v.positions}</span>
                    {v.rows.length > 1 && (
                      <span style={{ marginInlineStart: 6, fontSize: 11, color: 'var(--color-text-muted)', background: '#F0F2F5', borderRadius: 10, padding: '1px 6px' }}>
                        {v.rows.length}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <span className="num-ltr">{v.loa}</span>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'end', fontWeight: 600, color: 'var(--color-primary)' }}>
                    <span className="num-ltr">{fmtMoney(v.total_fee)}</span>
                  </td>
                  <td style={tdBase}><span className="num-ltr">{fmtDate(v.ata)}</span></td>
                  <td style={tdBase}><span className="num-ltr">{fmtDate(v.atd)}</span></td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {onGenerateReceipt && (
                        <button
                          onClick={() => handleGenerateReceipt(v.voyage_number)}
                          disabled={preparingReceipt === v.voyage_number}
                          style={{
                            padding: '5px 12px', borderRadius: 5,
                            border: '1px solid var(--color-primary)',
                            background: 'white', color: 'var(--color-primary)',
                            fontSize: 12, cursor: preparingReceipt === v.voyage_number ? 'default' : 'pointer',
                            fontWeight: 500, opacity: preparingReceipt === v.voyage_number ? 0.6 : 1,
                          }}>
                          {preparingReceipt === v.voyage_number ? '...' : t('generate_receipt')}
                        </button>
                      )}
                      {canEdit(v) && (
                        <button onClick={() => handleDelete(v)}
                          style={{
                            padding: '5px 12px', borderRadius: 5,
                            border: '1px solid var(--color-danger)',
                            background: 'white', color: 'var(--color-danger)',
                            fontSize: 12, cursor: 'pointer', fontWeight: 500,
                          }}>
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
