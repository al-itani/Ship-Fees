import { useState } from 'react'
import Sidebar from '../components/Sidebar.jsx'
import TopBar from '../components/TopBar.jsx'
import Home from './Home.jsx'
import BerthingScreen from './berthing/BerthingScreen.jsx'
import ContainerScreen from './container/ContainerScreen.jsx'
import GeneralCargoScreen from './generalcargo/GeneralCargoScreen.jsx'
import ReceiptPreview from './receipt/ReceiptPreview.jsx'
import ReceiptArchive from './receipt/ReceiptArchive.jsx'
import SettingsScreen from './settings/SettingsScreen.jsx'
import AutomateScreen from './automate/AutomateScreen.jsx'
import CMAScreen from './cma/CMAScreen.jsx'
import UserManagementScreen from './users/UserManagementScreen.jsx'

export default function MainApp() {
  const [currentScreen, setCurrentScreen]     = useState('home')
  const [containerVoyage, setContainerVoyage] = useState(null)
  // { voyageNumber, readOnly }
  const [receiptState, setReceiptState]       = useState(null)

  function handleGoToContainers(voyageNumber) {
    setContainerVoyage(voyageNumber)
    setCurrentScreen('containers')
  }

  function handleGenerateReceipt(voyageNumber) {
    setReceiptState({ voyageNumber, readOnly: false })
  }

  function handleViewReceipt(voyageNumber) {
    setReceiptState({ voyageNumber, readOnly: true })
  }

  function handleCloseReceipt() {
    setReceiptState(null)
  }

  function renderScreen() {
    switch (currentScreen) {
      case 'berthing':
        return <BerthingScreen onGoToContainers={handleGoToContainers} />
      case 'containers':
        return (
          <ContainerScreen
            initialVoyage={containerVoyage}
            onVoyageConsumed={() => setContainerVoyage(null)}
            onGenerateReceipt={handleGenerateReceipt}
          />
        )
      case 'general_cargo':
        return <GeneralCargoScreen onGenerateReceipt={handleGenerateReceipt} />
      case 'receipts_archive':
        return <ReceiptArchive onViewReceipt={handleViewReceipt} />
      case 'automate':
        return <AutomateScreen />
      case 'cma':
        return <CMAScreen />
      case 'settings':
        return <SettingsScreen />
      case 'user_management':
        return <UserManagementScreen />
      default:
        return <Home setCurrentScreen={setCurrentScreen} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar currentScreen={currentScreen} />
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--color-bg)' }}>
          {renderScreen()}
        </div>
      </div>

      {/* Full-screen receipt overlay — rendered via portal inside ReceiptPreview */}
      {receiptState && (
        <ReceiptPreview
          voyageNumber={receiptState.voyageNumber}
          readOnly={receiptState.readOnly}
          onClose={handleCloseReceipt}
        />
      )}
    </div>
  )
}
