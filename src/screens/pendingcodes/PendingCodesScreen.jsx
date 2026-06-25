import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'

const thStyle = {
  padding: '9px 16px', textAlign: 'start', fontWeight: 600,
  fontSize: 12, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.03em',
}
const tdStyle = { padding: '10px 16px', verticalAlign: 'middle', fontSize: 13 }

export default function PendingCodesScreen({ onCountChange }) {
  const { t } = useTranslation()
  const { session } = useSession()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await window.api.pendingCodesGetAll()
    if (res.success) setRows(res.data)
    setLoading(false)
    const cr = await window.api.pendingCodesGetCount()
    onCountChange?.(cr.count ?? 0)
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleApprove(id) {
    const res = await window.api.pendingCodesApprove(id, session.id)
    if (res.success) {
      showToast(t('code_approved'), 'success')
      await load()
    } else {
      showToast(res.error, 'error')
    }
  }

  async function handleReject(id) {
    const res = await window.api.pendingCodesReject(id, session.id)
    if (res.success) {
      showToast(t('code_rejected'), 'success')
      await load()
    } else {
      showToast(res.error, 'error')
    }
  }

  const containerRows = rows.filter(r => r.type === 'container')
  const gcRows = rows.filter(r => r.type === 'gc')

  function renderTable(items, label) {
    if (items.length === 0) return null
    return (
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 20 }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #F0F0F0', fontWeight: 600, fontSize: 14 }}>
          {label}
          <span style={{
            marginInlineStart: 8, background: '#EFF6FF', color: '#2563EB',
            borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 700,
          }}>{items.length}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFF' }}>
              <th style={thStyle}>{t('service_code')}</th>
              <th style={thStyle}>{t('description')}</th>
              <th style={{ ...thStyle, textAlign: 'end' }}>{t('price')}</th>
              <th style={thStyle}>{t('unit')}</th>
              <th style={thStyle}>{t('submitted_by')}</th>
              <th style={thStyle}>{t('submitted_at')}</th>
              <th style={{ ...thStyle, width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #F5F5F5' }}>
                <td style={tdStyle}><strong>{row.code}</strong></td>
                <td style={tdStyle}>{row.description || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'end' }}>
                  <span className="num-ltr">
                    {row.price != null ? `$${Number(row.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                  </span>
                </td>
                <td style={tdStyle}>{row.unit || '—'}</td>
                <td style={tdStyle}>{row.submitted_by_username || '—'}</td>
                <td style={tdStyle}>
                  <span className="num-ltr">{row.submitted_at ? row.submitted_at.slice(0, 16) : '—'}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'end' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleApprove(row.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        background: '#16a34a', color: 'white',
                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      {t('approve')}
                    </button>
                    <button
                      onClick={() => handleReject(row.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 6,
                        border: '1px solid var(--color-danger)',
                        background: 'white', color: 'var(--color-danger)',
                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      {t('reject')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, width: '100%' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? '#27ae60' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>{toast.msg}</div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t('pending_codes')}</h2>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 8, border: '1px solid var(--color-border)',
          padding: '48px 24px', textAlign: 'center',
          color: 'var(--color-text-muted)', fontSize: 14,
        }}>
          {t('pending_codes_empty')}
        </div>
      ) : (
        <>
          {renderTable(containerRows, t('containers'))}
          {renderTable(gcRows, t('general_cargo'))}
        </>
      )}
    </div>
  )
}
