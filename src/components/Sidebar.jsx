import { useTranslation } from 'react-i18next'
import { useSession } from '../context/SessionContext.jsx'

const VERSION = '1.0.1'

const navItems = [
  { key: 'home',            icon: '🏠', label: 'home',            active: true  },
  { key: 'automate',        icon: '🤖', label: 'automate',        active: true  },
  { key: 'berthing',        icon: '⚓', label: 'berthing',        active: true  },
  { key: 'containers',      icon: '📦', label: 'containers',      active: true  },
  { key: 'general_cargo',   icon: '📋', label: 'general_cargo',   active: true  },
  { key: 'storage',         icon: '🏪', label: 'storage',         active: false },
  { key: 'receipts_archive',icon: '🗂', label: 'receipts_archive',active: true  },
  { key: 'cma',             icon: '📊', label: 'cma_receipt',     active: true, permissionGated: true },
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
          // CMA is visible to admin always, or to users with the permission
          if (item.permissionGated && session?.role !== 'admin') {
            if (!session?.permissions?.includes('generate_cma_receipt')) return null
          }
          const isSelected = currentScreen === item.key
          return (
            <div
              key={item.key}
              onClick={() => item.active && setCurrentScreen(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 20px',
                cursor: item.active ? 'pointer' : 'default',
                background: isSelected ? 'var(--color-sidebar-active)' : 'transparent',
                color: item.active ? 'white' : 'rgba(255,255,255,0.35)',
                fontSize: 14,
                fontWeight: isSelected ? 600 : 400,
                transition: 'background 0.15s',
                userSelect: 'none',
              }}
              onMouseEnter={e => { if (item.active && !isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{t(item.label)}</span>
              {!item.active && (
                <span style={{
                  marginInlineStart: 'auto',
                  fontSize: 10,
                  background: 'rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.5)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}>
                  {t('coming_soon')}
                </span>
              )}
            </div>
          )
        })}
      </nav>

      {/* Admin nav items */}
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
          onClick={logout}
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
