import { useTranslation } from 'react-i18next'
import { useSession } from '../context/SessionContext.jsx'

const modules = [
  { key: 'voyage_services',  icon: '🚢', labelKey: 'voyage_services',  descKey: 'voyage_services_description',   active: true  },
  { key: 'storage',          icon: '🏪', labelKey: 'storage',          descKey: 'storage_description',           active: false },
  { key: 'receipts_archive', icon: '🗂', labelKey: 'receipts_archive', descKey: 'receipts_archive_description',  active: true  },
]

export default function Home({ setCurrentScreen }) {
  const { t } = useTranslation()
  const { session } = useSession()

  return (
    <div style={{ padding: 36 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>
        {t('welcome')}, {session?.full_name}
      </h2>
      <p style={{ margin: '0 0 32px', color: 'var(--color-text-muted)', fontSize: 14 }}>
        Port of Beirut — Ship Fees System
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 720 }}>
        {modules.map(m => (
          <div
            key={m.key}
            onClick={() => m.active && setCurrentScreen(m.key)}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '28px 24px',
              cursor: m.active ? 'pointer' : 'default',
              opacity: m.active ? 1 : 0.6,
              transition: 'box-shadow 0.15s, transform 0.15s',
              position: 'relative',
            }}
            onMouseEnter={e => { if (m.active) { e.currentTarget.style.boxShadow = '0 4px 20px rgba(46,77,138,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
          >
            {!m.active && (
              <span style={{
                position: 'absolute', top: 12, insetInlineEnd: 12,
                fontSize: 10, background: '#F0F0F0', color: '#999',
                borderRadius: 4, padding: '2px 7px',
              }}>
                {t('coming_soon')}
              </span>
            )}
            <div style={{ fontSize: 36, marginBottom: 12 }}>{m.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text)', marginBottom: 6 }}>
              {t(m.labelKey)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              {t(m.descKey)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
