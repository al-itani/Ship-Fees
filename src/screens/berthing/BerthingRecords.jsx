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

export default function BerthingRecords({ onEdit, onGenerateReceipt }) {
  const { t } = useTranslation()
  const { session } = useSession()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast]     = useState(null)
  const [preparingReceipt, setPreparingReceipt] = useState(null)

  useEffect(() => {
    loadRecords()
  }, [])

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
    if (!onGenerateReceipt) return
    setPreparingReceipt(voyageNumber)
    try {
      const res = await window.api.receiptPrepareBerthingOnly(voyageNumber, session.username)
      if (!res.success) { showToast(res.error || 'Error', 'error'); return }
      onGenerateReceipt(voyageNumber)
    } catch (err) {
      showToast(err.message || 'Error', 'error')
    } finally {
      setPreparingReceipt(null)
    }
  }

  const filtered = records.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.vessel_name?.toLowerCase().includes(q) ||
      r.voyage_number?.toLowerCase().includes(q) ||
      r.shipping_agent?.toLowerCase().includes(q)
    )
  })

  const thStyle = {
    padding: '10px 12px', textAlign: 'start', fontSize: 12,
    fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
    borderBottom: '2px solid var(--color-border)',
    background: '#F8F9FA',
  }
  const tdStyle = {
    padding: '10px 12px', fontSize: 13,
    borderBottom: '1px solid #F0F2F5', whiteSpace: 'nowrap',
    color: 'var(--color-text)',
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('voyage_number')}</th>
                <th style={thStyle}>{t('vessel_name')}</th>
                <th style={thStyle}>{t('shipping_agent')}</th>
                <th style={thStyle}>{t('position')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{t('loa')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{t('days')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{t('total_fee')}</th>
                <th style={thStyle}>{t('ata')}</th>
                <th style={thStyle}>{t('atd')}</th>
                <th style={thStyle}>{t('entered_by')}</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 260 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdStyle}><span className="num-ltr">{r.voyage_number}</span></td>
                  <td style={tdStyle}>
                    {r.vessel_name}
                    {r.vessel_type === 'RoRo' && r.roro_cargo_type && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        RoRo — {r.roro_cargo_type}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.shipping_agent}
                  </td>
                  <td style={tdStyle}>{r.position}</td>
                  <td style={{ ...tdStyle, textAlign: 'end' }}>
                    <span className="num-ltr">{r.loa}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end' }}>
                    <span className="num-ltr">{r.days}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end', fontWeight: 600, color: 'var(--color-primary)' }}>
                    <span className="num-ltr">{fmtMoney(r.final_fee)}</span>
                  </td>
                  <td style={tdStyle}><span className="num-ltr">{fmtDate(r.ata)}</span></td>
                  <td style={tdStyle}><span className="num-ltr">{fmtDate(r.atd)}</span></td>
                  <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>
                    {r.created_by_name || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {onGenerateReceipt && (
                        <button
                          onClick={() => handleGenerateReceipt(r.voyage_number)}
                          disabled={preparingReceipt === r.voyage_number}
                          style={{
                            padding: '5px 12px', borderRadius: 5,
                            border: '1px solid var(--color-success)',
                            background: 'white', color: 'var(--color-success)',
                            fontSize: 12, cursor: preparingReceipt === r.voyage_number ? 'not-allowed' : 'pointer',
                            fontWeight: 500, opacity: preparingReceipt === r.voyage_number ? 0.6 : 1,
                          }}
                        >
                          🧾 {t('generate_receipt')}
                        </button>
                      )}
                      {canEdit(r) && (
                        <>
                          <button
                            onClick={() => onEdit(r)}
                            style={{
                              padding: '5px 12px', borderRadius: 5, border: '1px solid var(--color-primary)',
                              background: 'white', color: 'var(--color-primary)',
                              fontSize: 12, cursor: 'pointer', fontWeight: 500,
                            }}
                          >
                            {t('edit')}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(r)}
                            style={{
                              padding: '5px 12px', borderRadius: 5, border: '1px solid var(--color-danger)',
                              background: 'white', color: 'var(--color-danger)',
                              fontSize: 12, cursor: 'pointer', fontWeight: 500,
                            }}
                          >
                            {t('delete')}
                          </button>
                        </>
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
