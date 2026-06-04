import { useEffect } from 'react'
import { useSession } from './context/SessionContext.jsx'
import Login from './screens/Login.jsx'
import ChangePassword from './screens/ChangePassword.jsx'
import MainApp from './screens/MainApp.jsx'

export default function App() {
  const { session, loadRates } = useSession()

  useEffect(() => {
    if (session && !session.must_change_password) {
      loadRates()
    }
  }, [session])

  if (!session) return <Login />
  if (session.must_change_password) return <ChangePassword />
  return <MainApp />
}
