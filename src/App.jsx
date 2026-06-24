import { useEffect } from 'react'
import { useSession } from './context/SessionContext.jsx'
import Login from './screens/Login.jsx'
import ChangePassword from './screens/ChangePassword.jsx'
import MainApp from './screens/MainApp.jsx'

export default function App() {
  const { session, loadRates, restoring } = useSession()

  useEffect(() => {
    if (session && !session.must_change_password) {
      loadRates()
    }
  }, [session])

  if (restoring) return (
    <div style={{ minHeight: '100vh', background: '#1B2A4A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading…</div>
    </div>
  )
  if (!session) return <Login />
  if (session.must_change_password) return <ChangePassword />
  return <MainApp />
}
