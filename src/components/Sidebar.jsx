import { useTranslation } from 'react-i18next'
import { useSession } from '../context/SessionContext.jsx'

const VERSION = '1.0.1'

const navItems = [
  { key: 'home',             icon: '🏠', label: 'home' },
  { key: 'automate',         icon: '🤖', label: 'automate',        permKey: 'perm_automate'        },
  { key: 'voyage_services',  icon: '🚢', label: 'voyage_services', permKey: 'perm_voyage'          },
  { key: 'storage',          icon: '🏪', label: 'storage',         permKey: 'perm_storage'         },
  { key: 'receipts_archive', icon: '🗂', label: 'receipts_archive', permKey: 'perm_receipt_archive' },
  { key: 'cma',              icon: '📊', label: 'cma_receipt',     permKey: 'perm_cma'             },
  { key: 'tariff_c',         icon: '📦', label: 'tariff_c',        permKey: 'perm_tariff_c'        },
  { key: 'audit_log',        icon: '📋', label: 'audit_log',       permKey: 'perm_audit_log'       },
  { key: 'staff_view',       icon: '👥', label: 'staff_view',      permKey: 'perm_staff_view'      },
]

const adminNavItems = [
  { key: 'user_management', icon: '👥', label: 'user_management' },
  { key: 'settings',        icon: '⚙️', label: 'settings' },
]

export default function Sidebar({ currentScreen, setCurrentScreen }) {
  const { t } = useTranslation()
  const { session, logout } = useSession()

  return (
    <div style={{
      width: 220,
      minWidth: 220,
      background: 'var(--color-sidebar)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
          {t('app_title')}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {navItems.map(item => {
          if (item.permKey && session?.role !== 'admin' && !session?.[item.permKey]) return null
          const isSelected = currentScreen === item.key
          return (
            <div
              key={item.key}
              onClick={() => setCurrentScreen(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 20px',
                cursor: 'pointer',
                background: isSelected ? 'var(--color-sidebar-active)' : 'transparent',
                color: 'white',
                fontSize: 14,
                fontWeight: isSelected ? 600 : 400,
                transition: 'background 0.15s',
                userSelect: 'none',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{t(item.label)}</span>
            </div>
          )
        })}
      </nav>

      {/* Admin-only tools */}
      {session?.role === 'admin' && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
          {adminNavItems.map(item => {
            const isSelected = currentScreen === item.key
            return (
              <div
                key={item.key}
                onClick={() => setCurrentScreen(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 20px', cursor: 'pointer',
                  background: isSelected ? 'var(--color-sidebar-active)' : 'transparent',
                  color: 'white', fontSize: 14,
                  fontWeight: isSelected ? 600 : 400,
                  transition: 'background 0.15s', userSelect: 'none',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span>{t(item.label)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session?.full_name}
        </div>
        <button
          onClick={() => logout(session?.id)}
          style={{
            width: '100%',
            padding: '8px 0',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.8)',
            cursor: 'pointer',
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          {t('logout')}
        </button>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center' }}>
          {t('version')} {VERSION}
        </div>
      </div>
    </div>
  )
}
