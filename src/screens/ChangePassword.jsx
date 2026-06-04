import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../context/SessionContext.jsx'

export default function ChangePassword() {
  const { t } = useTranslation()
  const { session, updateSession } = useSession()
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (newPw.length < 6) { setError(t('password_too_short')); return }
    if (newPw !== confirmPw) { setError(t('passwords_not_match')); return }
    setLoading(true)
    try {
      const res = await window.api.changePassword(session.id, newPw)
      if (res.success) {
        updateSession({ must_change_password: 0 })
      } else {
        setError(res.error || 'Error')
      }
    } catch {
      setError('Error')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', height: 44, padding: '0 14px',
    border: '1px solid var(--color-border)', borderRadius: 6,
    fontSize: 14, outline: 'none', marginTop: 6,
  }
  const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', display: 'block' }

  return (
    <div style={{
      minHeight: '100vh', background: '#1B2A4A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 40, width: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1B2A4A' }}>
          {t('change_password')}
        </h2>
        <p style={{ margin: '0 0 28px', color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
          {t('must_change_password_notice')}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>{t('new_password')}</label>
            <input
              style={inputStyle}
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>{t('confirm_password')}</label>
            <input
              style={inputStyle}
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, background: '#FEF2F2',
              color: 'var(--color-danger)', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 44, borderRadius: 6, border: 'none',
              background: 'var(--color-primary)', color: 'white',
              fontSize: 15, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '...' : t('change_password')}
          </button>
        </form>
      </div>
    </div>
  )
}
