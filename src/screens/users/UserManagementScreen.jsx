import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'
import { formatLocal } from '../../logic/formatDate.js'

const PERMISSIONS = [
  { key: 'edit_others_records',  labelKey: 'perm_edit_others_records'  },
  { key: 'access_tariff_editor', labelKey: 'perm_access_tariff_editor' },
]

const MODULE_PERMS = [
  { key: 'perm_voyage',          labelKey: 'perm_voyage'          },
  { key: 'perm_receipt',         labelKey: 'perm_receipt'         },
  { key: 'perm_storage',         labelKey: 'perm_storage'         },
  { key: 'perm_automate',        labelKey: 'perm_automate'        },
  { key: 'perm_cma',             labelKey: 'perm_cma'             },
  { key: 'perm_tariff_c',        labelKey: 'perm_tariff_c'        },
  { key: 'perm_audit_log',       labelKey: 'perm_audit_log'       },
  { key: 'perm_view_users',      labelKey: 'perm_view_users'      },
]

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/

function getPresence(user) {
  if (!user.is_online) return 'offline'
  if (!user.last_seen) return 'offline'
  const diffMin = (Date.now() - new Date(user.last_seen + 'Z').getTime()) / 60000
  if (diffMin < 3) return 'online'
  if (diffMin < 30) return 'idle'
  return 'offline'
}

// ─── Shared styles ────────────────────────────────────────────────
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
const selectStyle = { ...inputStyle, cursor: 'pointer' }
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }

// ─── Toast ────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: '#1B2A4A', color: 'white', borderRadius: 8,
      padding: '10px 22px', fontSize: 14, zIndex: 9999,
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    }}>
      {message}
    </div>
  )
}

// ─── Modal wrapper ─────────────────────────────────────────────────
function Modal({ title, onClose, children, width = 460 }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1B2A4A' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Avatar component ──────────────────────────────────────────────
function Avatar({ avatarPath, fullName, size = 48 }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!avatarPath) { setSrc(null); return }
    window.api.usersGetAvatarBase64(avatarPath).then(res => {
      if (res.success) setSrc(res.dataUrl)
    })
  }, [avatarPath])
  const initials = (fullName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (src) {
    return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>{initials}</div>
  )
}

// ─── Profile Edit dialog ──────────────────────────────────────────
function ProfileDialog({ session, onClose, onSaved, t, updateSession }) {
  const [fullName, setFullName] = useState(session.full_name || '')
  const [email, setEmail]       = useState(session.email || '')
  const [phone, setPhone]       = useState(session.phone || '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const fileRef = useRef(null)

  async function handleSave() {
    if (!fullName.trim()) { setError(t('required_fields_missing')); return }
    setSaving(true); setError('')
    try {
      const res = await window.api.usersUpdateProfile(session.id, { full_name: fullName, email, phone })
      if (!res.success) { setError(t(res.error) || res.error); return }
      updateSession({ full_name: fullName.trim(), email: email.trim() || null, phone: phone.trim() || null })
      onSaved(t('profile_updated'))
    } finally { setSaving(false) }
  }

  async function handleAvatarPick() {
    fileRef.current?.click()
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg', 'jpeg', 'png'].includes(ext)) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const res = await window.api.usersUploadAvatar({ userId: session.id, base64, ext })
      if (res.success) {
        updateSession({ avatar_path: res.path })
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <Modal title={t('edit_profile')} onClose={onClose} width={440}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar avatarPath={session.avatar_path} fullName={session.full_name} size={64} />
          <div>
            <button onClick={handleAvatarPick} style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {t('upload_avatar')}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('username')}</label>
          <input style={{ ...inputStyle, background: '#F5F7FA', color: '#888' }} value={session.username} readOnly />
        </div>
        <div>
          <label style={labelStyle}>{t('full_name')}</label>
          <input style={inputStyle} value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>{t('email')}</label>
          <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
        </div>
        <div>
          <label style={labelStyle}>{t('phone')}</label>
          <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+961 ..." dir="ltr" />
        </div>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: 13 }}>
            {t('cancel')}
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: 'white', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {t('save_changes')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Edit User dialog ─────────────────────────────────────────────
function EditUserDialog({ user, onClose, onSaved, t, session, showConfirm }) {
  const [fullName, setFullName] = useState(user.full_name)
  const [role, setRole]         = useState(user.role)
  const [language, setLanguage] = useState(user.language)
  const [perms, setPerms]       = useState([])
  const [modPerms, setModPerms] = useState({
    perm_storage:         !!user.perm_storage,
    perm_automate:        !!user.perm_automate,
    perm_cma:             !!user.perm_cma,
    perm_tariff_c:        !!user.perm_tariff_c,
    perm_receipt:         !!(user.perm_receipt || user.perm_receipt_archive),
    perm_voyage:          !!(user.perm_voyage || user.perm_berthing || user.perm_container || user.perm_gc),
    perm_audit_log:       !!user.perm_audit_log,
    perm_view_users:      !!user.perm_view_users,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    window.api.usersGetPermissions(user.id).then(res => {
      if (res.success) setPerms(res.data)
    })
  }, [user.id])

  async function handleSave() {
    if (!fullName.trim()) { setError(t('required_fields_missing')); return }
    if (role === 'admin' && session.role === 'admin' && user.role !== 'admin') {
      if (!await showConfirm(t('confirm'), t('warn_second_admin'))) return
    }
    setSaving(true); setError('')
    try {
      const res = await window.api.usersUpdate(user.id, { full_name: fullName, role, language }, session.id)
      if (!res.success) { setError(t(res.error) || res.error); return }
      onSaved(t('user_updated'))
    } finally { setSaving(false) }
  }

  async function togglePerm(key, currently) {
    const grant = !currently
    const res = await window.api.usersSetPermission(user.id, key, grant, session.id)
    if (res.success) {
      setPerms(prev => grant ? [...prev, key] : prev.filter(p => p !== key))
    }
  }

  async function toggleModPerm(key, currently) {
    const grant = !currently
    const res = await window.api.usersSetPermission(user.id, key, grant, session.id)
    if (res.success) setModPerms(prev => ({ ...prev, [key]: grant }))
  }

  const isOwnAccount = user.id === session.id

  return (
    <Modal title={t('edit')} onClose={onClose} width={480}>
      <div style={{ display: 'grid', gap: 14 }}>
        {/* Username (read-only) */}
        <div>
          <label style={labelStyle}>{t('username')}</label>
          <input style={{ ...inputStyle, background: '#F5F7FA', color: '#888' }} value={user.username} readOnly />
        </div>
        <div>
          <label style={labelStyle}>{t('full_name')}</label>
          <input style={inputStyle} value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>{t('role')}</label>
          <select style={selectStyle} value={role} onChange={e => setRole(e.target.value)} disabled={isOwnAccount}>
            <option value="user">{t('role_user')}</option>
            <option value="manager">{t('role_manager')}</option>
            <option value="admin">{t('role_admin')}</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>{t('language')}</label>
          <select style={selectStyle} value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="en">{t('lang_en')}</option>
            <option value="ar">{t('lang_ar')}</option>
          </select>
        </div>

        {/* Permissions — only shown for non-admin users */}
        {role !== 'admin' && (
          <>
            <div style={{ borderTop: '1px solid #EEF0F6', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('permissions')}
              </div>
              {PERMISSIONS.map(p => {
                const granted = perms.includes(p.key)
                return (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={granted}
                      onChange={() => togglePerm(p.key, granted)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    {t(p.labelKey)}
                  </label>
                )
              })}
            </div>

            <div style={{ borderTop: '1px solid #EEF0F6', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('module_access')}
              </div>
              {MODULE_PERMS.map(p => (
                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={modPerms[p.key]}
                    onChange={() => toggleModPerm(p.key, modPerms[p.key])}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  {t(p.labelKey)}
                </label>
              ))}
            </div>
          </>
        )}

        {error && <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: 13 }}>
            {t('cancel')}
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: 'white', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {t('save_changes')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Reset Password dialog ─────────────────────────────────────────
function ResetPasswordDialog({ user, onClose, onSaved, t, session }) {
  const [pwd, setPwd]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleReset() {
    if (pwd.length < 6) { setError(t('password_too_short')); return }
    setSaving(true); setError('')
    try {
      const res = await window.api.usersResetPassword(user.id, pwd, session.id)
      if (!res.success) { setError(t(res.error) || res.error); return }
      onSaved(t('password_reset_ok'))
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`${t('reset_password')} — ${user.username}`} onClose={onClose} width={400}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={labelStyle}>{t('temp_password')}</label>
          <input
            style={inputStyle} type="password"
            value={pwd} onChange={e => setPwd(e.target.value)}
            placeholder="min 6 characters"
          />
        </div>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: 13 }}>
            {t('cancel')}
          </button>
          <button onClick={handleReset} disabled={saving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#E67E22', color: 'white', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {t('reset_password')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main screen ──────────────────────────────────────────────────
export default function UserManagementScreen() {
  const { t } = useTranslation()
  const { session, updateSession } = useSession()
  const isAdmin = session?.role === 'admin'

  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState('')
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState('role')
  const [sortDir, setSortDir]       = useState('desc')

  // Dialogs
  const [editUser, setEditUser]         = useState(null)
  const [resetUser, setResetUser]       = useState(null)
  const [showAddForm, setShowAddForm]   = useState(false)
  const [showProfile, setShowProfile]   = useState(false)

  // In-app confirm / alert modals
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [alertDialog, setAlertDialog]     = useState(null)
  const confirmResolveRef = useRef(null)

  function showConfirm(title, message) {
    return new Promise(resolve => {
      confirmResolveRef.current = resolve
      setConfirmDialog({ title, message })
    })
  }
  function resolveConfirm(result) {
    setConfirmDialog(null)
    confirmResolveRef.current?.(result)
    confirmResolveRef.current = null
  }
  function showAlert(title, message) {
    setAlertDialog({ title, message })
  }

  useEffect(() => {
    if (!confirmDialog) return
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); resolveConfirm(true) }
      if (e.key === 'Escape') { e.preventDefault(); resolveConfirm(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDialog])

  useEffect(() => {
    if (!alertDialog) return
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); setAlertDialog(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [alertDialog])

  // Add User form state
  const [newUsername, setNewUsername]   = useState('')
  const [newFullName, setNewFullName]   = useState('')
  const [newRole, setNewRole]           = useState('user')
  const [newLang, setNewLang]           = useState('en')
  const [newPwd, setNewPwd]             = useState('')
  const [addError, setAddError]         = useState('')
  const [adding, setAdding]             = useState(false)

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

  function showToast(msg) { setToast(msg) }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = users.filter(u => {
    if (u.id === session?.id) return false
    if (!isAdmin && !u.is_active) return false
    if (!search) return true
    const q = search.toLowerCase()
    return u.username.includes(q) || u.full_name.toLowerCase().includes(q) || u.role.includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey] ?? ''; let bv = b[sortKey] ?? ''
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const totalCount  = users.length
  const activeCount = users.filter(u => u.is_active).length

  function fmtDate(ts) {
    if (!ts) return t('never')
    return formatLocal(ts)
  }

  function sortArrow(key) {
    if (sortKey !== key) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  async function handleToggleActive(user) {
    const isActive = !user.is_active
    const confirmMsg = isActive ? t('confirm_enable_user', { username: user.username }) : t('confirm_disable_user', { username: user.username })
    if (!await showConfirm(t('confirm'), confirmMsg)) return

    const res = await window.api.usersSetActive(user.id, isActive, session.id)
    if (!res.success) {
      showAlert(t('error'), t(res.error) || res.error)
      return
    }
    showToast(isActive ? t('user_enabled') : t('user_disabled'))
    load()
  }

  async function handleDelete(user) {
    if (!await showConfirm(t('confirm'), t('confirm_disable_user', { username: user.username }))) return
    const res = await window.api.usersDelete(user.id, session.id)
    if (!res.success) { showAlert(t('error'), t(res.error) || res.error); return }
    showToast(t('user_disabled'))
    load()
  }

  async function handleAddUser(e) {
    e.preventDefault()
    setAddError('')
    if (!USERNAME_RE.test(newUsername)) { setAddError(t('username_invalid')); return }
    if (!newFullName.trim()) { setAddError(t('required_fields_missing')); return }
    if (newPwd.length < 6)  { setAddError(t('password_too_short')); return }
    if (newRole === 'admin') {
      if (!await showConfirm(t('confirm'), t('warn_second_admin'))) return
    }
    setAdding(true)
    const res = await window.api.usersCreate({
      username: newUsername, full_name: newFullName,
      role: newRole, language: newLang, temp_password: newPwd, admin_id: session.id,
    })
    setAdding(false)
    if (!res.success) { setAddError(t(res.error) || res.error); return }
    showToast(t('user_created'))
    setNewUsername(''); setNewFullName(''); setNewRole('user'); setNewLang('en'); setNewPwd('')
    setShowAddForm(false)
    load()
  }

  const btnStyle = (variant = 'default') => ({
    padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
    background: variant === 'primary' ? 'var(--color-primary)'
               : variant === 'danger'  ? '#DC2626'
               : variant === 'warning' ? '#E67E22'
               : '#F0F4FF',
    color: variant === 'default' ? '#1B2A4A' : 'white',
  })

  return (
    <div className="app-screen" style={{ padding: 28, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1B2A4A' }}>
            {t('user_management')}
          </h2>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {t('users_count', { total: totalCount, active: activeCount })}
          </div>
        </div>
        {session?.role === 'admin' && (
          <button
            onClick={() => setShowAddForm(v => !v)}
            style={{ ...btnStyle('primary'), padding: '9px 18px', fontSize: 13 }}
          >
            + {t('add_user')}
          </button>
        )}
      </div>

      {/* Your Profile card — pinned at top */}
      {session && (
        <div style={{ ...card, padding: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
          <Avatar avatarPath={session.avatar_path} fullName={session.full_name} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1B2A4A' }}>{session.full_name}</span>
              {session.role === 'admin' && (
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: '#1B2A4A', color: 'white',
                }}>
                  {t('role_admin')}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              @{session.username}
              {session.email && <span style={{ marginInlineStart: 12 }}>{session.email}</span>}
              {session.phone && <span style={{ marginInlineStart: 12 }} dir="ltr" className="num-ltr">{session.phone}</span>}
            </div>
          </div>
          <button
            onClick={() => setShowProfile(true)}
            style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1B2A4A', whiteSpace: 'nowrap' }}
          >
            {t('edit_profile')}
          </button>
        </div>
      )}

      {/* Add User Form — admin only */}
      {showAddForm && session?.role === 'admin' && (
        <div style={{ ...card, padding: 24, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1B2A4A' }}>{t('add_user')}</h3>
          <form onSubmit={handleAddUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{t('username')} *</label>
                <input
                  style={inputStyle} value={newUsername}
                  onChange={e => setNewUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder={t('username_hint')}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('full_name')} *</label>
                <input style={inputStyle} value={newFullName} onChange={e => setNewFullName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>{t('role')}</label>
                <select style={selectStyle} value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="user">{t('role_user')}</option>
                  <option value="manager">{t('role_manager')}</option>
                  <option value="admin">{t('role_admin')}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('language')}</label>
                <select style={selectStyle} value={newLang} onChange={e => setNewLang(e.target.value)}>
                  <option value="en">{t('lang_en')}</option>
                  <option value="ar">{t('lang_ar')}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('temp_password')} *</label>
                <input style={inputStyle} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              </div>
            </div>
            {addError && <div style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{addError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={adding} style={{ ...btnStyle('primary'), padding: '8px 20px', fontSize: 13, opacity: adding ? 0.7 : 1 }}>
                {t('add_user')}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ ...btnStyle(), padding: '8px 16px', fontSize: 13 }}>
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Table */}
      <div style={card}>
        {/* Search */}
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
                    ...(isAdmin ? [['role', t('role')]] : []),
                    ['is_online',  t('status')],
                    ['language',   t('language')],
                    ['last_login', t('last_login')],
                  ].map(([key, label]) => (
                    <th key={key} style={TH} onClick={() => handleSort(key)}>
                      {label}{sortArrow(key)}
                    </th>
                  ))}
                  {session?.role === 'admin' && <th style={{ ...TH, cursor: 'default' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map(user => {
                  const isSelf    = user.id === session.id
                  const isActive  = !!user.is_active
                  const presence  = getPresence(user)
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
                        {isSelf && <span style={{ marginInlineStart: 6, fontSize: 10, background: '#EDF2FF', color: '#3B5BDB', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>you</span>}
                        {!isActive && <span style={{ marginInlineStart: 6, fontSize: 10, background: '#FEE2E2', color: '#DC2626', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>{t('disabled')}</span>}
                      </td>
                      <td style={TD}>{user.full_name}</td>
                      {isAdmin && (
                        <td style={TD}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                            background: user.role === 'admin' ? '#1B2A4A' : user.role === 'manager' ? '#7C3AED' : '#F0F4FF',
                            color: user.role === 'admin' || user.role === 'manager' ? 'white' : '#1B2A4A',
                          }}>
                            {t(`role_${user.role}`)}
                          </span>
                        </td>
                      )}
                      <td style={TD}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, ...presenceStyle }}>
                          {presenceLabel}
                        </span>
                      </td>
                      <td style={TD}>{user.language === 'ar' ? t('lang_ar') : t('lang_en')}</td>
                      <td style={{ ...TD, color: 'var(--color-text-muted)' }} className="num-ltr">{fmtDate(user.last_login)}</td>
                      {session?.role === 'admin' && (
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={btnStyle()} onClick={() => setEditUser(user)} title={t('edit')}>
                              ✏️
                            </button>
                            <button style={btnStyle('warning')} onClick={() => setResetUser(user)} title={t('reset_password')}>
                              🔑
                            </button>
                            <button
                              style={{ ...btnStyle(isActive ? 'danger' : 'primary'), opacity: isSelf ? 0.4 : 1 }}
                              disabled={isSelf}
                              onClick={() => !isSelf && handleToggleActive(user)}
                              title={isSelf ? t('cannot_self_disable') : (isActive ? t('disable_user') : t('enable_user'))}
                            >
                              {isActive ? t('disable_user') : t('enable_user')}
                            </button>
                            <button
                              style={{ ...btnStyle('danger'), opacity: isSelf ? 0.4 : 1 }}
                              disabled={isSelf}
                              onClick={() => !isSelf && handleDelete(user)}
                              title={t('disable_user')}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile dialog */}
      {showProfile && session && (
        <ProfileDialog
          session={session} t={t} updateSession={updateSession}
          onClose={() => setShowProfile(false)}
          onSaved={msg => { setShowProfile(false); showToast(msg) }}
        />
      )}

      {/* Dialogs — admin only */}
      {session?.role === 'admin' && editUser && (
        <EditUserDialog
          user={editUser} t={t} session={session} showConfirm={showConfirm}
          onClose={() => setEditUser(null)}
          onSaved={msg => { setEditUser(null); showToast(msg); load() }}
        />
      )}
      {session?.role === 'admin' && resetUser && (
        <ResetPasswordDialog
          user={resetUser} t={t} session={session}
          onClose={() => setResetUser(null)}
          onSaved={msg => { setResetUser(null); showToast(msg) }}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {/* In-app confirm modal */}
      {confirmDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, width: 380,
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)', padding: 28,
          }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>
              {confirmDialog.title}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => resolveConfirm(false)}
                style={{
                  padding: '9px 18px', borderRadius: 6, fontSize: 13,
                  border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer',
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                style={{
                  padding: '9px 20px', borderRadius: 6, border: 'none',
                  background: 'var(--color-danger)', color: 'white',
                  fontWeight: 600, cursor: 'pointer', fontSize: 13,
                }}
              >
                {t('confirm_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app alert modal */}
      {alertDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, width: 380,
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)', padding: 28,
          }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>
              {alertDialog.title}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
              {alertDialog.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAlertDialog(null)}
                style={{
                  padding: '9px 20px', borderRadius: 6, border: 'none',
                  background: 'var(--color-primary)', color: 'white',
                  fontWeight: 600, cursor: 'pointer', fontSize: 13,
                }}
              >
                {t('ok') || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
