import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocal } from '../../logic/formatDate.js'

const PAGE_SIZE = 50

const ACTION_TYPES = [
  'login', 'logout', 'password_change', 'ai_extract',
  'receipt_generated', 'receipt_deleted',
  'berthing_created', 'berthing_updated', 'berthing_deleted',
  'container_saved', 'gc_saved', 'cma_exported',
  'user_created', 'user_updated', 'user_deleted', 'user_disabled', 'user_enabled',
  'permission_changed', 'storage_saved', 'batch_import',
]

const card = {
  background: 'white', borderRadius: 10,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
}
const TH = {
  padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#1B2A4A', background: '#F0F4FF',
  borderBottom: '2px solid #D0D8EC', whiteSpace: 'nowrap',
}
const TD = {
  padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #EEF0F6', verticalAlign: 'top',
}
const selectStyle = {
  height: 34, padding: '0 10px', border: '1px solid var(--color-border)',
  borderRadius: 6, fontSize: 13, outline: 'none', background: 'white', cursor: 'pointer',
}
const inputStyle = {
  height: 34, padding: '0 10px', border: '1px solid var(--color-border)',
  borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

function DetailCell({ detail }) {
  const [open, setOpen] = useState(false)
  if (!detail) return <td style={TD} />
  let parsed
  try { parsed = JSON.parse(detail) } catch { return <td style={TD}>{detail}</td> }
  const summary = typeof parsed === 'object'
    ? Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(', ')
    : String(parsed)
  return (
    <td style={TD}>
      <span style={{ fontSize: 12, color: '#374151' }}>{summary.slice(0, 80)}{summary.length > 80 ? '…' : ''}</span>
      {summary.length > 80 && (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            style={{ marginInlineStart: 6, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: 10, color: 'var(--color-primary)', fontWeight: 600 }}
          >
            {open ? '▲' : '▼'}
          </button>
          {open && (
            <pre style={{ margin: '4px 0 0', fontSize: 11, background: '#F8F9FB', borderRadius: 4, padding: '6px 8px', maxWidth: 300, overflowX: 'auto', color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(parsed, null, 2)}
            </pre>
          )}
        </>
      )}
    </td>
  )
}

export default function StatisticsScreen() {
  const { t } = useTranslation()

  const [entries, setEntries] = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(0)

  const [filterUser,   setFilterUser]   = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  const [userOptions, setUserOptions] = useState([])

  useEffect(() => {
    window.api.usersGetAll().then(res => {
      if (res.success) setUserOptions(res.data)
    })
  }, [])

  const load = useCallback(async (pg = 0) => {
    setLoading(true)
    const filters = {
      user_id:     filterUser   || undefined,
      action_type: filterAction || undefined,
      date_from:   filterFrom   || undefined,
      date_to:     filterTo     || undefined,
      limit:  PAGE_SIZE,
      offset: pg * PAGE_SIZE,
    }
    const res = await window.api.statsGetStats(filters)
    if (res.success) { setEntries(res.data); setTotal(res.total) }
    setLoading(false)
  }, [filterUser, filterAction, filterFrom, filterTo])

  useEffect(() => { setPage(0); load(0) }, [load])

  function applyPage(pg) { setPage(pg); load(pg) }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="app-screen" style={{ padding: 28, maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>
          {t('statistics_usage')}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
          {total} {t('audit_total_entries')}
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selectStyle} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
          <option value="">{t('audit_all_users')}</option>
          {userOptions.map(u => (
            <option key={u.id} value={u.id}>{u.username}</option>
          ))}
        </select>

        <select style={selectStyle} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">{t('stat_action_type')}: {t('audit_all_actions')}</option>
          {ACTION_TYPES.map(a => (
            <option key={a} value={a}>{t(`stat_action_${a}`) || a}</option>
          ))}
        </select>

        <input
          style={{ ...inputStyle, width: 130 }}
          type="date" value={filterFrom}
          onChange={e => setFilterFrom(e.target.value)}
          title={t('date_from')}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>→</span>
        <input
          style={{ ...inputStyle, width: 130 }}
          type="date" value={filterTo}
          onChange={e => setFilterTo(e.target.value)}
          title={t('date_to')}
        />

        {(filterUser || filterAction || filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterUser(''); setFilterAction(''); setFilterFrom(''); setFilterTo('') }}
            style={{ ...inputStyle, width: 'auto', padding: '0 12px', cursor: 'pointer', color: 'var(--color-danger)', fontWeight: 600 }}
          >
            {t('clear_filters')}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('loading')}…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('no_results')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>{t('date')}</th>
                  <th style={TH}>{t('username')}</th>
                  <th style={TH}>{t('stat_action_type')}</th>
                  <th style={TH}>{t('stat_endpoint')}</th>
                  <th style={TH}>{t('stat_detail')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ ...TD, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }} className="num-ltr">
                      {formatLocal(e.created_at)}
                    </td>
                    <td style={{ ...TD, fontWeight: 600 }}>
                      {e.username || <span style={{ color: '#aaa', fontWeight: 400 }}>system</span>}
                    </td>
                    <td style={TD}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: '#F0F4FF', color: '#1B2A4A' }}>
                        {t(`stat_action_${e.action_type}`) || e.action_type}
                      </span>
                    </td>
                    <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }} className="num-ltr">
                      {e.api_endpoint || '—'}
                    </td>
                    <DetailCell detail={e.detail} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #EEF0F6', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <button
              disabled={page === 0}
              onClick={() => applyPage(page - 1)}
              style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'white', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1, fontSize: 13 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => applyPage(page + 1)}
              style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'white', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1, fontSize: 13 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
