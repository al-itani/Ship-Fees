import { useTranslation } from 'react-i18next'
import { useSession } from '../context/SessionContext.jsx'

export default function TopBar({ currentScreen }) {
  const { t, i18n } = useTranslation()
  const { switchLanguage } = useSession()
  const lang = i18n.language

  const screenLabel = {
    home:            t('home'),
    automate:        t('automate'),
    berthing:        t('berthing'),
    containers:      t('containers'),
    general_cargo:   t('general_cargo'),
    storage:         t('storage'),
    receipts_archive:t('receipts_archive'),
    settings:        t('settings'),
  }[currentScreen] || ''

  return (
    <div dir="ltr" style={{
      height: 56,
      background: 'white',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
        <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{t('app_title')}</span>
        {screenLabel && (
          <>
            <span style={{ margin: '0 8px' }}>›</span>
            <span>{screenLabel}</span>
          </>
        )}
      </div>
      <div>
        <button
          onClick={() => switchLanguage(lang === 'ar' ? 'en' : 'ar')}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-primary)',
          }}
        >
          {lang === 'ar' ? 'EN' : 'AR'}
        </button>
      </div>
    </div>
  )
}
