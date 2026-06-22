import { useTranslation } from 'react-i18next'
import { useSession } from '../context/SessionContext.jsx'

const ALL_MODULES = [
  { key: 'voyage_services',  icon: '🚢', labelKey: 'voyage_services',  descKey: 'voyage_services_description',  permKey: 'perm_voyage'          },
  { key: 'automate',         icon: '🤖', labelKey: 'automate',         descKey: 'automate_description',         permKey: 'perm_automate'        },
  { key: 'storage',          icon: '🏪', labelKey: 'storage',          descKey: 'storage_description',          permKey: 'perm_storage'         },
  { key: 'receipts_archive', icon: '🗂', labelKey: 'receipts_archive', descKey: 'receipts_archive_description', permKey: 'perm_receipt_archive' },
  { key: 'cma',              icon: '📊', labelKey: 'cma_receipt',      descKey: 'cma_receipt_description',      permKey: 'perm_cma'             },
  { key: 'tariff_c',         icon: '📦', labelKey: 'tariff_c',         descKey: 'tariff_c_description',         permKey: 'perm_tariff_c'        },
  { key: 'audit_log',        icon: '📋', labelKey: 'audit_log',        descKey: 'audit_log_description',        permKey: 'perm_audit_log'       },
  { key: 'staff_view',       icon: '👥', labelKey: 'staff_view',       descKey: 'staff_view_description',       permKey: 'perm_staff_view'      },
]

export default function Home({ setCurrentScreen }) {
  const { t } = useTranslation()
  const { session } = useSession()

  const modules = ALL_MODULES.filter(m => {
    if (!m.permKey) return true
    if (session?.role === 'admin') return true
    return !!session?.[m.permKey]
  })

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
            onClick={() => setCurrentScreen(m.key)}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '28px 24px',
              cursor: 'pointer',
              transition: 'box-shadow 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(46,77,138,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
          >
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
