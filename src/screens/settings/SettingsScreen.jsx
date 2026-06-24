import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'

const fieldStyle = {
  width: '100%', height: 44, padding: '0 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 6, fontSize: 14, outline: 'none',
  background: 'white', boxSizing: 'border-box',
}
const labelStyle = {
  fontSize: 13, fontWeight: 500,
  color: 'var(--color-text-muted)',
  display: 'block', marginBottom: 4,
}

export default function SettingsScreen() {
  const { t } = useTranslation()
  const { session } = useSession()

  const [apiKey,     setApiKey]     = useState('')
  const [showKey,    setShowKey]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [toast,      setToast]      = useState(null)
  const [loaded,     setLoaded]     = useState(false)

  const [showReset,    setShowReset]    = useState(false)
  const [resetWord,    setResetWord]    = useState('')
  const [resetting,    setResetting]    = useState(false)

  useEffect(() => {
    window.api.settingsLoad().then(res => {
      if (res.success) setApiKey(res.data.apiKey || '')
      setLoaded(true)
    })
  }, [])

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSave() {
    setSaving(true)
    const res = await window.api.settingsSave({ apiKey: apiKey.trim() })
    setSaving(false)
    if (res.success) showToast(t('settings_key_saved'), 'success')
    else showToast(res.error, 'error')
  }

  async function handleTest() {
    if (!apiKey.trim()) { showToast(t('import_error_no_key'), 'error'); return }
    setTesting(true)
    // Save first so the main process reads the latest key
    await window.api.settingsSave({ apiKey: apiKey.trim() })
    const res = await window.api.aiTestConnection()
    setTesting(false)
    if (res.success) showToast(t('settings_test_ok'), 'success')
    else {
      const msg = res.error === 'invalid_api_key' ? t('import_error_invalid_key')
        : res.error === 'network_error' ? t('import_error_network')
        : t('settings_test_fail') + ': ' + res.error
      showToast(msg, 'error')
    }
  }

  async function handleReset() {
    if (resetWord !== 'RESET') { showToast(t('settings_reset_wrong_word'), 'error'); return }
    setResetting(true)
    const res = await window.api.dbReset(session?.id, session?.username)
    setResetting(false)
    setShowReset(false)
    setResetWord('')
    if (res.success) showToast(t('settings_reset_success'), 'success')
    else showToast(t('settings_reset_error', { error: res.error }), 'error')
  }

  const keyLooks = apiKey.startsWith('sk-ant-') && apiKey.length > 20
  const keyEmpty = !apiKey.trim()

  return (
    <div className="app-screen" style={{ padding: 36, maxWidth: 600 }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? '#27ae60' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px',
          fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>
        ⚙️ {t('settings')}
      </h2>
      <p style={{ margin: '0 0 32px', color: 'var(--color-text-muted)', fontSize: 14 }}>
        {t('settings_admin_only')}
      </p>

      {/* API Key Section */}
      <div style={{
        background: 'white', border: '1px solid var(--color-border)',
        borderRadius: 10, padding: 28,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: 'var(--color-text)' }}>
          {t('settings_ai_section')}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>{t('settings_api_key')}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                style={{ ...fieldStyle, paddingRight: 72 }}
                type={showKey ? 'text' : 'password'}
                value={loaded ? apiKey : ''}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  padding: '2px 8px', fontSize: 12, border: '1px solid var(--color-border)',
                  borderRadius: 4, background: '#F8FAFF', cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
              >
                {showKey ? t('settings_hide_key') : t('settings_show_key')}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            {keyEmpty ? (
              <span style={{ color: '#9CA3AF' }}>⚪ {t('settings_key_empty')}</span>
            ) : keyLooks ? (
              <span style={{ color: '#27ae60' }}>✓ {t('settings_key_valid')}</span>
            ) : (
              <span style={{ color: '#F59E0B' }}>⚠ {t('import_error_invalid_key')}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 24px', borderRadius: 6, border: 'none',
              background: saving ? '#B0BEC5' : 'var(--color-primary)',
              color: 'white', fontWeight: 600, fontSize: 14,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '...' : t('settings_save_key')}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || keyEmpty}
            style={{
              padding: '10px 20px', borderRadius: 6, fontSize: 14,
              border: '1px solid var(--color-border)',
              background: testing || keyEmpty ? '#F5F5F5' : 'white',
              color: testing || keyEmpty ? '#9CA3AF' : 'var(--color-text)',
              cursor: testing || keyEmpty ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {testing ? '...' : t('settings_test_connection')}
          </button>
        </div>

        <p style={{ margin: '20px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          {t('settings_key_hint')}
        </p>
      </div>

      {/* Danger Zone */}
      <div style={{
        background: 'white', border: '1px solid #FCA5A5',
        borderRadius: 10, padding: 28, marginTop: 24,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#B91C1C' }}>
          {t('settings_reset_db_title')}
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          {t('settings_reset_db_hint')}
        </p>
        <button
          onClick={() => { setShowReset(true); setResetWord('') }}
          style={{
            padding: '10px 20px', borderRadius: 6, border: '1px solid #EF4444',
            background: 'white', color: '#B91C1C', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('settings_reset_db')}
        </button>
      </div>

      {/* Reset confirmation modal */}
      {showReset && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, padding: '32px 36px',
            maxWidth: 420, width: '90%', boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 22, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: '#B91C1C' }}>
              {t('settings_reset_db')}
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#444', lineHeight: 1.6 }}>
              {t('settings_reset_db_hint')}
            </p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-muted)' }}>
              {t('settings_reset_confirm_prompt')}
            </label>
            <input
              value={resetWord}
              onChange={e => setResetWord(e.target.value)}
              placeholder={t('settings_reset_confirm_placeholder')}
              style={{
                width: '100%', height: 40, padding: '0 12px',
                border: '1px solid #EF4444', borderRadius: 6, fontSize: 14,
                boxSizing: 'border-box', marginBottom: 20, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowReset(false); setResetWord('') }}
                style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 13, cursor: 'pointer' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleReset}
                disabled={resetting || resetWord !== 'RESET'}
                style={{
                  padding: '10px 20px', borderRadius: 6, border: 'none',
                  background: (resetting || resetWord !== 'RESET') ? '#FCA5A5' : '#B91C1C',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: (resetting || resetWord !== 'RESET') ? 'not-allowed' : 'pointer',
                }}
              >
                {resetting ? '...' : t('settings_reset_confirm_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
