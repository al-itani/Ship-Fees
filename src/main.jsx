import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/index.css'
import './i18n/index.js'
import App from './App.jsx'
import { SessionProvider } from './context/SessionContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>
)
