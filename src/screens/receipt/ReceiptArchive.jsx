import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDate(s) {
  if (!s) return '—'
  return s.slice(0, 16).replace('T', ' ')
}

const thStyle = {
  padding: '9px 14px', textAlign: 'start', fontWeight: 600,
  fontSize: 12, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.03em',
}
const tdStyle = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' }

export default function ReceiptArchive({ onViewReceipt }) {
  const { t } = useTranslation()
  const { session } = useSession()

  const [receipts, setReceipts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast]           = useState(null)

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

  const filtered = receipts.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (r.voyage_number || '').toLowerCase().includes(q) ||
      (r.vessel_name   || '').toLowerCase().includes(q) ||
      (r.shipping_agent|| '').toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
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

      {/* Search */}
      <div style={{ marginBottom: 16, maxWidth: 380 }}>
        <input
          style={{
            width: '100%', height: 40, padding: '0 14px',
            border: '1px solid var(--color-border)',
            borderRadius: 6, fontSize: 14, outline: 'none', background: 'white',
          }}
          placeholder={t('search_receipts')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={e => { e.target.style.borderColor = 'var(--color-primary)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--color-border)' }}
        />
      </div>

      {loading && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '20px 0' }}>
          {t('loading')}...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{
          background: 'white', borderRadius: 8,
          border: '1px solid var(--color-border)',
          padding: '40px', textAlign: 'center',
          color: 'var(--color-text-muted)', fontSize: 14,
        }}>
          {receipts.length === 0 ? t('no_receipts') : t('no_results')}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFF' }}>
                <th style={thStyle}>{t('bill_number')}</th>
                <th style={thStyle}>{t('vessel_name')}</th>
                <th style={thStyle}>{t('shipping_agent')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{t('ata_short')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{t('atd_short')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{t('final_price')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{t('generated_at')}</th>
                <th style={{ ...thStyle, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  style={{ borderBottom: '1px solid #F5F5F5', cursor: 'pointer' }}
                  onClick={() => onViewReceipt(r.voyage_number)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFF' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={tdStyle}>
                    <strong style={{ color: 'var(--color-primary)' }}>{r.bill_number || r.voyage_number}</strong>
                  </td>
                  <td style={tdStyle}>{r.vessel_name || '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--color-text-muted)', fontSize: 12 }}>
                    {r.shipping_agent || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end', fontSize: 12 }}>
                    <span className="num-ltr">{fmtDate(r.ata)}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end', fontSize: 12 }}>
                    <span className="num-ltr">{fmtDate(r.atd)}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end' }}>
                    <span className="num-ltr" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                      {fmt(r.final_price)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <span className="num-ltr">{fmtDate(r.generated_at)}</span>
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
              {t('receipt_voyage_label')}: <strong>{deleteTarget.voyage_number}</strong>
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
