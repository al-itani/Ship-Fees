import { createContext, useContext, useState, useCallback } from 'react'
import i18n from '../i18n/index.js'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ratesData, setRatesData] = useState(null)
  const [agents, setAgents] = useState([])

  const login = useCallback((user) => {
    setSession(user)
    const lang = user.language || 'en'
    i18n.changeLanguage(lang)
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [])

  const logout = useCallback(() => {
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
