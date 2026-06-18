import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'

const card = {
  background: 'white', borderRadius: 10,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 24,
}
const TH = {
  padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#1B2A4A', background: '#F0F4FF',
  borderBottom: '2px solid #D0D8EC', whiteSpace: 'nowrap', cursor: 'pointer',
  userSelect: 'none',
}
const TD = {
  padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #EEF0F6', verticalAlign: 'middle',
}
const inputStyle = {
  width: '100%', height: 38, padding: '0 12px',
  border: '1px solid var(--color-border)', borderRadius: 6,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

function getPresence(user) {
  if (!user.is_online) return 'offline'
  if (!user.last_seen) return 'offline'
  const diffMin = (Date.now() - new Date(user.last_seen + 'Z').getTime()) / 60000
  if (diffMin < 3) return 'online'
  if (diffMin < 30) return 'idle'
  return 'offline'
}

export default function ManagerStaffScreen() {
  const { t } = useTranslation()
  const { session } = useSession()

  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState('full_name')
  const [sortDir, setSortDir] = useState('asc')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.api.usersGetAll()
    if (res.success) setUsers(res.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortArrow(key) {
    if (sortKey !== key) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  function fmtDate(ts) {
    if (!ts) return t('never')
    return ts.slice(0, 16).replace('T', ' ')
  }

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.username.includes(q) || u.full_name.toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey] ?? ''; let bv = b[sortKey] ?? ''
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const onlineCount = users.filter(u => getPresence(u) === 'online').length

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>
          {t('staff_view')}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
          {users.length} {t('username').toLowerCase()}s · {onlineCount} {t('presence_online').toLowerCase()}
        </div>
      </div>

      <div style={card}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #EEF0F6' }}>
          <input
            style={{ ...inputStyle, width: 280 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search')}
          />
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('loading')}…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('no_results')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    ['username',   t('username')],
                    ['full_name',  t('full_name')],
                    ['is_online',  t('status')],
                    ['language',   t('language')],
                    ['last_login', t('last_login')],
                  ].map(([key, label]) => (
                    <th key={key} style={TH} onClick={() => handleSort(key)}>
                      {label}{sortArrow(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(user => {
                  const isSelf   = user.id === session.id
                  const isActive = !!user.is_active
                  const presence = getPresence(user)
                  const presenceStyle = {
                    online:  { background: '#ECFDF5', color: '#059669' },
                    idle:    { background: '#FFFBEB', color: '#D97706' },
                    offline: { background: '#F3F4F6', color: '#6B7280' },
                  }[presence]
                  const presenceLabel = {
                    online:  t('presence_online'),
                    idle:    t('presence_idle'),
                    offline: t('presence_offline'),
                  }[presence]
                  return (
                    <tr key={user.id} style={{ background: isActive ? 'white' : '#FAFAFA', opacity: isActive ? 1 : 0.55 }}>
                      <td style={TD}>
                        <span style={{ fontWeight: 600 }}>{user.username}</span>
                        {isSelf && (
                          <span style={{ marginInlineStart: 6, fontSize: 10, background: '#EDF2FF', color: '#3B5BDB', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                            you
                          </span>
                        )}
                        {!isActive && (
                          <span style={{ marginInlineStart: 6, fontSize: 10, background: '#FEE2E2', color: '#DC2626', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                            {t('disabled')}
                          </span>
                        )}
                      </td>
                      <td style={TD}>{user.full_name}</td>
                      <td style={TD}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, ...presenceStyle }}>
                          {presenceLabel}
                        </span>
                      </td>
                      <td style={TD}>{user.language === 'ar' ? t('lang_ar') : t('lang_en')}</td>
                      <td style={{ ...TD, color: 'var(--color-text-muted)' }} className="num-ltr">
                        {fmtDate(user.last_login)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
