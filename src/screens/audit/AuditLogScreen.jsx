import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

const PAGE_SIZE = 50

const ACTION_STYLES = {
  INSERT: { background: '#ECFDF5', color: '#059669' },
  UPDATE: { background: '#FFFBEB', color: '#D97706' },
  DELETE: { background: '#FEF2F2', color: '#DC2626' },
}

const ACTION_LABELS = {
  INSERT: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
}

const TABLE_LABELS = {
  berthing_records:   'Berthing',
  container_services: 'Container',
  gc_services:        'General Cargo',
  receipts:           'Receipts',
  users:              'Users',
  import:             'Bulk Import',
}

// Grouped entries store a plain-language description in new_data.summary (with the
// voyage alongside). Falls back to old_data for safety. Returns null for legacy
// per-row entries that only carry raw field JSON.
function parsePayload(e) {
  for (const raw of [e.new_data, e.old_data]) {
    if (!raw) continue
    try {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object' && p.summary) return p
    } catch { /* not JSON — ignore */ }
  }
  return null
}

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

function DataBlock({ label, json }) {
  if (!json) return null
  let parsed
  try { parsed = JSON.parse(json) } catch { return <span style={{ fontSize: 12, color: '#999' }}>{json}</span> }
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <pre style={{
        margin: 0, fontSize: 11, background: '#F8F9FB', borderRadius: 4,
        padding: '6px 8px', maxWidth: 340, overflowX: 'auto',
        color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  )
}

function DetailCell({ action, oldData, newData, summary }) {
  const [open, setOpen] = useState(false)
  // Grouped entries: show the plain-language summary directly (always visible).
  if (summary) {
    return <td style={{ ...TD, color: '#374151' }}>{summary}</td>
  }
  const hasDetail = oldData || newData
  if (!hasDetail) return <td style={TD} />
  return (
    <td style={TD}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '3px 10px', borderRadius: 4, border: '1px solid var(--color-border)',
          background: 'white', cursor: 'pointer', fontSize: 11, color: 'var(--color-primary)', fontWeight: 600,
        }}
      >
        {open ? '▲ Hide' : '▼ Show'}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {action === 'UPDATE' && <DataBlock label="Before" json={oldData} />}
          {action === 'UPDATE' && <DataBlock label="After"  json={newData} />}
          {action === 'INSERT' && <DataBlock label="Data"   json={newData} />}
          {action === 'DELETE' && <DataBlock label="Data"   json={oldData} />}
        </div>
      )}
    </td>
  )
}

export default function AuditLogScreen() {
  const { t } = useTranslation()

  const [entries, setEntries]   = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(0)

  const [filterAction, setFilterAction]     = useState('')
  const [filterTable,  setFilterTable]      = useState('')
  const [filterUser,   setFilterUser]       = useState('')
  const [filterFrom,   setFilterFrom]       = useState('')
  const [filterTo,     setFilterTo]         = useState('')

  const [tableOptions, setTableOptions] = useState([])
  const [userOptions,  setUserOptions]  = useState([])

  useEffect(() => {
    window.api.auditGetFilterOptions().then(res => {
      if (res.success) {
        setTableOptions(res.tables)
        setUserOptions(res.users)
      }
    })
  }, [])

  const load = useCallback(async (pg = 0) => {
    setLoading(true)
    const filters = {
      action:     filterAction || undefined,
      table_name: filterTable  || undefined,
      user_id:    filterUser   || undefined,
      date_from:  filterFrom   || undefined,
      date_to:    filterTo     || undefined,
      limit:  PAGE_SIZE,
      offset: pg * PAGE_SIZE,
    }
    const res = await window.api.auditGetEntries(filters)
    if (res.success) { setEntries(res.data); setTotal(res.total) }
    setLoading(false)
  }, [filterAction, filterTable, filterUser, filterFrom, filterTo])

  useEffect(() => { setPage(0); load(0) }, [load])

  function applyPage(pg) { setPage(pg); load(pg) }

  function fmtDate(ts) {
    if (!ts) return '—'
    return ts.slice(0, 16).replace('T', ' ')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="app-screen" style={{ padding: 28, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>
          {t('audit_log')}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
          {total} {t('audit_total_entries')}
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selectStyle} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">{t('audit_all_actions')}</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>

        <select style={selectStyle} value={filterTable} onChange={e => setFilterTable(e.target.value)}>
          <option value="">{t('audit_all_tables')}</option>
          {tableOptions.map(tbl => (
            <option key={tbl} value={tbl}>{TABLE_LABELS[tbl] || tbl}</option>
          ))}
        </select>

        <select style={selectStyle} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
          <option value="">{t('audit_all_users')}</option>
          {userOptions.map(u => (
            <option key={u.id} value={u.id}>{u.username}</option>
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

        {(filterAction || filterTable || filterUser || filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterAction(''); setFilterTable(''); setFilterUser(''); setFilterFrom(''); setFilterTo('') }}
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
                  <th style={TH}>{t('audit_action')}</th>
                  <th style={TH}>{t('audit_table')}</th>
                  <th style={TH}>{t('audit_record_id')}</th>
                  <th style={TH}>{t('audit_details')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const payload = parsePayload(e)
                  return (
                  <tr key={e.id}>
                    <td style={{ ...TD, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }} className="num-ltr">
                      {fmtDate(e.created_at)}
                    </td>
                    <td style={{ ...TD, fontWeight: 600 }}>
                      {e.username || <span style={{ color: '#aaa', fontWeight: 400 }}>system</span>}
                    </td>
                    <td style={TD}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                        ...(ACTION_STYLES[e.action] || {}),
                      }}>
                        {ACTION_LABELS[e.action] || e.action}
                      </span>
                    </td>
                    <td style={TD}>
                      <span style={{ fontSize: 12, background: '#F0F4FF', color: '#1B2A4A', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                        {TABLE_LABELS[e.table_name] || e.table_name}
                      </span>
                    </td>
                    <td style={{ ...TD, color: 'var(--color-text-muted)' }} className="num-ltr">
                      {payload?.voyage ? `Voyage ${payload.voyage}` : `#${e.record_id}`}
                    </td>
                    <DetailCell action={e.action} oldData={e.old_data} newData={e.new_data} summary={payload?.summary} />
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
