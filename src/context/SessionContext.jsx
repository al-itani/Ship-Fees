import { createContext, useContext, useState, useCallback, useRef } from 'react'
import i18n from '../i18n/index.js'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ratesData, setRatesData] = useState(null)
  const [agents, setAgents] = useState([])
  const heartbeatRef = useRef(null)

  const login = useCallback((user) => {
    setSession(user)
    const lang = user.language || 'en'
    i18n.changeLanguage(lang)
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
    // Heartbeat every 60s so the server knows this user is still active
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      window.api.usersHeartbeat(user.id)
    }, 60000)
  }, [])

  const logout = useCallback((userId) => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
    if (userId) window.api.authLogout(userId)
    setSession(null)
    setRatesData(null)
    setAgents([])
  }, [])

  const updateSession = useCallback((updates) => {
    setSession(prev => prev ? { ...prev, ...updates } : prev)
  }, [])

  const switchLanguage = useCallback((lang) => {
    i18n.changeLanguage(lang)
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
    updateSession({ language: lang })
  }, [updateSession])

  const loadRates = useCallback(async () => {
    if (ratesData) return
    const [ratesRes, agentsRes] = await Promise.all([
      window.api.getRates(),
      window.api.getAgents(),
    ])
    if (ratesRes.success)  setRatesData(ratesRes.data)
    if (agentsRes.success) setAgents(agentsRes.data)
  }, [ratesData])

  return (
    <SessionContext.Provider value={{
      session, login, logout, updateSession, switchLanguage,
      ratesData, agents, loadRates,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
