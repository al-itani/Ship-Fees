import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import { formatLocal } from '../../logic/formatDate.js'

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDate(s) {
  if (!s) return '—'
  return s.slice(0, 16).replace('T', ' ')
}

const thBase = {
  padding: '9px 14px', fontWeight: 600,
  fontSize: 12, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.03em',
  userSelect: 'none',
}
const tdStyle = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' }

export default function ReceiptArchive({ onViewReceipt }) {
  const { t } = useTranslation()
  const { session } = useSession()

  const [receipts, setReceipts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeTab, setActiveTab]   = useState('voyage')
  const [search, setSearch]         = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast]           = useState(null)
  const [sortCol, setSortCol]       = useState('generated_at')
  const [sortDir, setSortDir]       = useState('desc')

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const res = await window.api.receiptGetAll()
    setLoading(false)
    if (res.success) setReceipts(res.data)
  }

  // Enter/Escape for delete confirm
  useEffect(() => {
    if (!deleteTarget) return
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); confirmDelete() }
      if (e.key === 'Escape') { e.preventDefault(); setDeleteTarget(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget])

  async function confirmDelete() {
    if (!deleteTarget) return
    const res = await window.api.receiptDelete(deleteTarget.id, session.id)
    setDeleteTarget(null)
    if (res.success) {
      showToast(t('record_deleted'), 'success')
      load()
    } else {
      showToast(res.error, 'error')
    }
  }

  const tabs = [
    { key: 'voyage', label: t('receipt_tab_voyages') },
    { key: 'tariff_c', label: t('receipt_tab_tariff_c') },
    { key: 'storage', label: t('receipt_tab_storage') },
  ]

  const tabReceipts = receipts.filter(r => (r.receipt_type || 'voyage') === activeTab)

  function receiptMonth(r) {
    const sourceDate = activeTab === 'voyage' ? (r.ata || r.generated_at) : r.generated_at
    return sourceDate ? sourceDate.slice(0, 7) : ''
  }

  const monthOptions = [...new Set(
    tabReceipts
      .map(r => receiptMonth(r) || null)
      .filter(Boolean)
  )].sort((a, b) => b.localeCompare(a))

  const filtered = tabReceipts.filter(r => {
    if (monthFilter && receiptMonth(r) !== monthFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (r.voyage_number || '').toLowerCase().includes(q) ||
      (r.vessel_name   || '').toLowerCase().includes(q) ||
      (r.shipping_agent|| '').toLowerCase().includes(q) ||
      (r.display_name  || '').toLowerCase().includes(q) ||
      (r.display_agent || '').toLowerCase().includes(q)
    )
  })

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortCol]
    let bv = b[sortCol]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = sortCol === 'final_price'
      ? av - bv
      : String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="app-screen" style={{ padding: 28, maxWidth: 1100 }}>
      {/* Toast */}
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

      <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
        🗂 {t('receipts_archive')}
      </h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                setMonthFilter('')
              }}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderBottom: active ? '3px solid var(--color-primary)' : '3px solid transparent',
                background: 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: 14,
                fontWeight: active ? 700 : 600,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Search + Month filter */}
      {activeTab !== 'storage' && (
      <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          style={{
            flex: '1 1 280px', height: 40, padding: '0 14px',
            border: '1px solid var(--color-border)',
            borderRadius: 6, fontSize: 14, outline: 'none', background: 'white',
          }}
          placeholder={t('search_receipts')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={e => { e.target.style.borderColor = 'var(--color-primary)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--color-border)' }}
        />
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          style={{
            height: 40, padding: '0 12px',
            border: '1px solid var(--color-border)',
            borderRadius: 6, fontSize: 14, outline: 'none',
            background: 'white', cursor: 'pointer', minWidth: 160,
            color: monthFilter ? 'var(--color-text)' : 'var(--color-text-muted)',
          }}
        >
          <option value="">{t('filter_all_months')}</option>
          {monthOptions.map(ym => {
            const [year, month] = ym.split('-')
            const label = new Date(Number(year), Number(month) - 1, 1)
              .toLocaleString('en-US', { month: 'long', year: 'numeric' })
            return <option key={ym} value={ym}>{label}</option>
          })}
        </select>
      </div>
      )}

      {loading && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '20px 0' }}>
          {t('loading')}...
        </div>
      )}

      {!loading && activeTab === 'storage' && (
        <div style={{
          background: 'white', borderRadius: 8,
          border: '1px solid var(--color-border)',
          padding: '40px', textAlign: 'center',
          color: 'var(--color-text-muted)', fontSize: 14,
        }}>
          {t('storage_receipts_unavailable')}
        </div>
      )}

      {!loading && activeTab !== 'storage' && filtered.length === 0 && (
        <div style={{
          background: 'white', borderRadius: 8,
          border: '1px solid var(--color-border)',
          padding: '40px', textAlign: 'center',
          color: 'var(--color-text-muted)', fontSize: 14,
        }}>
          {tabReceipts.length === 0 ? t('no_receipts') : t('no_results')}
        </div>
      )}

      {!loading && activeTab !== 'storage' && filtered.length > 0 && (
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFF' }}>
                {[
                  { col: 'bill_number',    label: t('bill_number'),    align: 'start' },
                  { col: 'display_name',   label: activeTab === 'tariff_c' ? t('agency_name') : t('vessel_name'), align: 'start' },
                  { col: 'display_agent',  label: activeTab === 'tariff_c' ? t('period_label') : t('shipping_agent'), align: 'start' },
                  ...(activeTab !== 'tariff_c' ? [
                    { col: 'ata', label: t('ata_short'), align: 'end' },
                    { col: 'atd', label: t('atd_short'), align: 'end' },
                  ] : []),
                  { col: 'final_price',    label: t('final_price'),    align: 'end'   },
                  { col: 'generated_by',   label: t('generated_by_label'), align: 'start' },
                  { col: 'generated_at',   label: t('generated_at'),   align: 'end'   },
                ].map(({ col, label, align }) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    style={{ ...thBase, textAlign: align, cursor: 'pointer' }}
                  >
                    {label}
                    {sortCol === col && (
                      <span style={{ marginInlineStart: 4, fontSize: 11 }}>
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                ))}
                <th style={{ ...thBase, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr
                  key={r.id}
                  style={{ borderBottom: '1px solid #F5F5F5', cursor: 'pointer' }}
                  onClick={() => onViewReceipt(r)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFF' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={tdStyle}>
                    <strong style={{ color: 'var(--color-primary)' }}>{r.bill_number || r.voyage_number}</strong>
                  </td>
                  <td style={tdStyle}>{r.display_name || r.vessel_name || '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--color-text-muted)', fontSize: 12 }}>
                    {r.display_agent || r.shipping_agent || '—'}
                  </td>
                  {activeTab !== 'tariff_c' && (
                    <td style={{ ...tdStyle, textAlign: 'end', fontSize: 12 }}>
                      <span className="num-ltr">{fmtDate(r.ata)}</span>
                    </td>
                  )}
                  {activeTab !== 'tariff_c' && (
                    <td style={{ ...tdStyle, textAlign: 'end', fontSize: 12 }}>
                      <span className="num-ltr">{fmtDate(r.atd)}</span>
                    </td>
                  )}
                  <td style={{ ...tdStyle, textAlign: 'end' }}>
                    <span className="num-ltr" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                      {fmt(r.final_price)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {r.generated_by || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <span className="num-ltr">{formatLocal(r.generated_at)}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(r) }}
                      style={{
                        background: 'none', border: 'none',
                        color: 'var(--color-danger)', cursor: 'pointer',
                        fontSize: 16, padding: '0 6px', lineHeight: 1,
                      }}
                      title={t('delete')}
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{
            padding: '10px 16px', borderTop: '1px solid #F0F0F0',
            fontSize: 12, color: 'var(--color-text-muted)',
          }}>
            {t('records_count', { count: filtered.length })}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, width: 380,
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)', padding: '28px',
          }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>
              {t('confirm_delete_receipt')}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px' }}>
              {(deleteTarget.receipt_type || 'voyage') === 'tariff_c' ? t('tc_billing_number') : t('receipt_voyage_label')}: <strong>{deleteTarget.bill_number || deleteTarget.voyage_number}</strong>
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: '9px 18px', borderRadius: 6, fontSize: 13,
                  border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer',
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '9px 20px', borderRadius: 6, border: 'none',
                  background: 'var(--color-danger)', color: 'white',
                  fontWeight: 600, cursor: 'pointer', fontSize: 13,
                }}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
