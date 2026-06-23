import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../context/SessionContext.jsx'
import i18n from '../i18n/index.js'
import portLogo from '../assets/port-logo.jpg'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [lang, setLang]         = useState('en')

  function toggleLang() {
    const next = lang === 'en' ? 'ar' : 'en'
    setLang(next)
    i18n.changeLanguage(next)
    document.documentElement.dir  = next === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      const res = await window.api.login(username.trim(), password)
      if (res.success) {
        login({ ...res.user, language: lang })
      } else {
        setError(t(res.error) || t('invalid_login'))
      }
    } catch {
      setError(t('invalid_login'))
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
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Lang toggle */}
      <div style={{ position: 'fixed', top: 20, right: 24 }}>
        <button onClick={toggleLang} style={{
          padding: '6px 16px', borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'transparent', color: 'rgba(255,255,255,0.8)',
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>
          {lang === 'ar' ? 'EN' : 'AR'}
        </button>
      </div>

      {/* Card */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 40,
        width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={portLogo} alt="Port of Beirut" style={{ width: 120, height: 'auto', display: 'inline-block' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>{t('username')}</label>
            <input
              style={inputStyle}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>{t('password')}</label>
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
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
            disabled={loading || !username.trim() || !password}
            style={{
              width: '100%', height: 44, borderRadius: 6, border: 'none',
              background: 'var(--color-primary)', color: 'white',
              fontSize: 15, fontWeight: 600,
              cursor: (loading || !username.trim() || !password) ? 'not-allowed' : 'pointer',
              opacity: (loading || !username.trim() || !password) ? 0.5 : 1,
            }}
          >
            {loading ? '...' : t('login')}
          </button>
        </form>
      </div>
    </div>
  )
}
