const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')

// Initialize DB (creates file + schema + seeds on first run)
require('./database/db')

const authHandlers       = require('./database/handlers/auth')
const berthingHandlers   = require('./database/handlers/berthing')
const containerHandlers  = require('./database/handlers/container')
const gcHandlers         = require('./database/handlers/gc')
const receiptHandlers    = require('./database/handlers/receipts')
const cmaHandlers        = require('./database/handlers/cma')
const usersHandlers      = require('./database/handlers/users')
const auditHandlers      = require('./database/handlers/audit')
const settingsHandlers   = require('./handlers/settings')
const aiHandlers         = require('./handlers/ai')
const { getConfig }      = require('./configStore')
const clientHandlers     = require('./client')

const appConfig = getConfig()
if (appConfig.mode !== 'client') require('./server').startServer()

const C = appConfig.mode === 'client'
console.log('MODE:', appConfig.mode, 'C:', C)

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

let lastDocumentDir = 'C:\\Users\\User\\Desktop\\MAIN\\Work\\Port\\Ships\\Automate'
let lastReceiptDir  = null

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    title: 'Ship Fees — Port of Beirut',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
    win.webContents.on('did-finish-load', () => win.webContents.focus())
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
    win.setMenu(null)
  }
}

// Auth
ipcMain.handle('auth:login',
  (_, username, password) => C
    ? clientHandlers.login(username, password)
    : authHandlers.login(username, password)
)
ipcMain.handle('auth:changePassword',
  // client.js signature is (userId, currentPassword, newPassword); pass null for currentPassword
  (_, userId, newPassword) => C
    ? clientHandlers.changePassword(userId, null, newPassword)
    : authHandlers.changePassword(userId, newPassword)
)
ipcMain.handle('auth:logout', (_, userId) => authHandlers.logout(userId))

// Berthing
ipcMain.handle('berthing:getRates',
  () => C ? clientHandlers.berthingGetRates() : berthingHandlers.getRates()
)
ipcMain.handle('berthing:getAgents',
  () => C ? clientHandlers.berthingGetAgents() : berthingHandlers.getAgents()
)
ipcMain.handle('berthing:save',
  (_, data) => C ? clientHandlers.berthingSave(data) : berthingHandlers.save(data)
)
ipcMain.handle('berthing:getAll',
  () => C ? clientHandlers.berthingGetAll() : berthingHandlers.getAll()
)
ipcMain.handle('berthing:update',
  (_, id, data) => C ? clientHandlers.berthingUpdate(id, data) : berthingHandlers.update(id, data)
)
ipcMain.handle('berthing:delete',
  // client.js berthingSoftDelete does not accept opts; local handler still gets opts
  (_, id, userId, opts) => C
    ? clientHandlers.berthingSoftDelete(id, userId)
    : berthingHandlers.softDelete(id, userId, opts)
)

// Container
ipcMain.handle('container:lookupVoyage',
  (_, voyageNumber) => C
    ? clientHandlers.containerLookupVoyage(voyageNumber)
    : containerHandlers.lookupVoyage(voyageNumber)
)
ipcMain.handle('container:listVoyages',
  () => C ? clientHandlers.containerListVoyages() : containerHandlers.listVoyages()
)
ipcMain.handle('container:getCodes',
  () => C ? clientHandlers.containerGetCodes() : containerHandlers.getCodes()
)
ipcMain.handle('container:saveSession',
  // data arrives as a single object; destructure for client which takes (voyageNumber, lines, savedBy)
  (_, data) => C
    ? clientHandlers.containerSaveSession(data.voyageNumber, data.lines, data.created_by)
    : containerHandlers.saveSession(data)
)
ipcMain.handle('container:getLines',
  (_, voyageNumber) => C
    ? clientHandlers.containerGetLines(voyageNumber)
    : containerHandlers.getLines(voyageNumber)
)
ipcMain.handle('container:deleteLine',
  (_, id, userId) => C
    ? clientHandlers.containerDeleteLine(id, userId)
    : containerHandlers.deleteLine(id, userId)
)

// General Cargo
ipcMain.handle('gc:lookupVoyage',
  (_, voyageNumber) => C
    ? clientHandlers.gcLookupVoyage(voyageNumber)
    : gcHandlers.lookupVoyage(voyageNumber)
)
ipcMain.handle('gc:listVoyages',
  () => C ? clientHandlers.gcListVoyages() : gcHandlers.listVoyages()
)
ipcMain.handle('gc:getCodes',
  () => C ? clientHandlers.gcGetCodes() : gcHandlers.getCodes()
)
ipcMain.handle('gc:saveSession',
  // data arrives as a single object; destructure for client which takes (voyageNumber, lines, savedBy)
  (_, data) => C
    ? clientHandlers.gcSaveSession(data.voyageNumber, data.lines, data.created_by)
    : gcHandlers.saveSession(data)
)
ipcMain.handle('gc:getLines',
  (_, voyageNumber) => C
    ? clientHandlers.gcGetLines(voyageNumber)
    : gcHandlers.getLines(voyageNumber)
)
ipcMain.handle('gc:deleteLine',
  (_, id, userId) => C
    ? clientHandlers.gcDeleteLine(id, userId)
    : gcHandlers.deleteLine(id, userId)
)

// Receipts
ipcMain.handle('receipt:getData',
  (_, voyageNumber) => C
    ? clientHandlers.receiptGetData(voyageNumber)
    : receiptHandlers.getDataForReceipt(voyageNumber)
)
ipcMain.handle('receipt:save',
  (_, data) => C ? clientHandlers.receiptSave(data) : receiptHandlers.saveReceipt(data)
)
ipcMain.handle('receipt:getAll',
  () => C ? clientHandlers.receiptGetAll() : receiptHandlers.getAll()
)
ipcMain.handle('receipt:delete',
  (_, id, userId) => C
    ? clientHandlers.receiptSoftDelete(id, userId)
    : receiptHandlers.softDelete(id, userId)
)
ipcMain.handle('receipt:prepareBerthingOnly',
  // client.js prepareBerthingOnly does not accept username; local handler still gets it
  (_, voyageNumber, username) => C
    ? clientHandlers.prepareBerthingOnly(voyageNumber)
    : receiptHandlers.prepareBerthingOnly(voyageNumber, username)
)

// PDF Export — uses printToPDF on the calling window's webContents
ipcMain.handle('dialog:openDocuments', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      filters: [{ name: 'Documents', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }],
      properties: ['openFile', 'multiSelections'],
    }
    if (lastDocumentDir) opts.defaultPath = lastDocumentDir
    const { canceled, filePaths } = await dialog.showOpenDialog(win, opts)
    if (canceled || filePaths.length === 0) return { success: false, canceled: true }
    lastDocumentDir = path.dirname(filePaths[0])
    const files = []
    for (const fp of filePaths) {
      const bytes    = await fs.promises.readFile(fp)
      const stat     = await fs.promises.stat(fp)
      const ext      = path.extname(fp).toLowerCase()
      const mimeType = ext === '.pdf' ? 'application/pdf' : (ext === '.png' ? 'image/png' : 'image/jpeg')
      files.push({ filename: path.basename(fp), data: bytes.toString('base64'), mimeType, size: bytes.length, mtimeMs: stat.mtimeMs })
    }
    return { success: true, files }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('receipt:exportPDF', async (event, { defaultFilename }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const defaultPath = lastReceiptDir ? path.join(lastReceiptDir, defaultFilename) : defaultFilename
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    lastReceiptDir = path.dirname(filePath)
    const pdfData = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'printableArea' },
    })
    await fs.promises.writeFile(filePath, pdfData)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Batch PDF export — no dialog, writes directly to the computed path, creates folder if needed
ipcMain.handle('receipt:exportPDFBatch', async (event, { filePath }) => {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    const pdfData = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'printableArea' },
    })
    await fs.promises.writeFile(filePath, pdfData)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// CMA Receipt
// IPC receives (year, month) to match preload call order; client.js signature is (month, year) — swap intentional
ipcMain.handle('cma:getReport',
  (_, year, month) => C
    ? clientHandlers.cmaGetReport(month, year)
    : cmaHandlers.getReport(year, month)
)

ipcMain.handle('cma:exportExcel', async (event, { year, month, agent }) => {
  try {
    const result = cmaHandlers.getVoyageDetail(year, month, agent)
    if (!result.success) return result

    const XLSX = require('xlsx')
    const rows = result.data

    const toRow = r => ({
      'Vessel Name':   r.vessel_name || '',
      'Agent':         r.agent,
      'Voyage #':      r.voyage_number,
      'Bill #':        r.bill_number || '',
      '20ft Local':    r.local_20,
      '40ft Local':    r.local_40,
      '20ft Trans':    r.trans_20,
      '40ft Trans':    r.trans_40,
      'Local TEUs':    r.local_teus,
      'Trans TEUs':    r.trans_teus,
      'Local Fee ($)': r.local_fee,
      'Trans Fee ($)': r.trans_fee,
      'Total ($)':     r.total,
    })

    const headers = ['Vessel Name','Agent','Voyage #','Bill #','20ft Local','40ft Local','20ft Trans','40ft Trans','Local TEUs','Trans TEUs','Local Fee ($)','Trans Fee ($)','Total ($)']

    // Voyages sheet
    const wsVoyages = XLSX.utils.json_to_sheet(rows.map(toRow), { header: headers })
    wsVoyages['!cols'] = headers.map(h => ({ wch: Math.max(h.length, ...rows.map(r => String(toRow(r)[h] ?? '').length)) + 2 }))

    // Summary sheet
    const totals = rows.reduce((acc, r) => ({
      local_20: acc.local_20 + r.local_20, local_40: acc.local_40 + r.local_40,
      trans_20: acc.trans_20 + r.trans_20, trans_40: acc.trans_40 + r.trans_40,
      local_teus: acc.local_teus + r.local_teus, trans_teus: acc.trans_teus + r.trans_teus,
      local_fee: acc.local_fee + r.local_fee, trans_fee: acc.trans_fee + r.trans_fee,
      total: acc.total + r.total,
    }), { local_20:0, local_40:0, trans_20:0, trans_40:0, local_teus:0, trans_teus:0, local_fee:0, trans_fee:0, total:0 })

    const summaryRow = {
      'Vessel Name':   `${agent} — ${MONTHS[month - 1]} ${year}`,
      'Agent':         agent,
      'Voyage #':      `${rows.length} voyage(s)`,
      'Bill #':        '',
      '20ft Local':    totals.local_20,
      '40ft Local':    totals.local_40,
      '20ft Trans':    totals.trans_20,
      '40ft Trans':    totals.trans_40,
      'Local TEUs':    totals.local_teus,
      'Trans TEUs':    totals.trans_teus,
      'Local Fee ($)': +totals.local_fee.toFixed(2),
      'Trans Fee ($)': +totals.trans_fee.toFixed(2),
      'Total ($)':     +totals.total.toFixed(2),
    }
    const wsSummary = XLSX.utils.json_to_sheet([summaryRow], { header: headers })
    wsSummary['!cols'] = headers.map(h => ({ wch: Math.max(h.length, String(summaryRow[h] ?? '').length) + 2 }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsVoyages, 'Voyages')
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

    const agentSafe = agent.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    const defaultFilename = `CMA_${agentSafe}_${MONTHS[month - 1]}_${year}.xlsx`

    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultFilename,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    XLSX.writeFile(wb, filePath)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// User Management
ipcMain.handle('users:getAll',
  () => C ? clientHandlers.usersGetAll() : usersHandlers.getAll()
)
ipcMain.handle('users:create',
  (_, data) => C ? clientHandlers.usersCreate(data) : usersHandlers.create(data)
)
ipcMain.handle('users:update',
  // adminId not forwarded to client (server doesn't require it for this endpoint)
  (_, id, data, adminId) => C
    ? clientHandlers.usersUpdate(id, data)
    : usersHandlers.update(id, data, adminId)
)
ipcMain.handle('users:resetPassword',
  // adminId not forwarded to client
  (_, id, tmpPwd, adminId) => C
    ? clientHandlers.usersResetPassword(id, tmpPwd)
    : usersHandlers.resetPassword(id, tmpPwd, adminId)
)
ipcMain.handle('users:setActive',
  // adminId not forwarded to client
  (_, id, isActive, adminId) => C
    ? clientHandlers.usersSetActive(id, isActive)
    : usersHandlers.setActive(id, isActive, adminId)
)
ipcMain.handle('users:getPermissions',
  (_, userId) => C
    ? clientHandlers.usersGetPermissions(userId)
    : usersHandlers.getPermissions(userId)
)
ipcMain.handle('users:setPermission',
  // adminId not forwarded to client
  (_, userId, key, grant, adminId) => C
    ? clientHandlers.usersSetPermission(userId, key, grant)
    : usersHandlers.setPermission(userId, key, grant, adminId)
)
ipcMain.handle('users:checkRecords',
  (_, userId) => C
    ? clientHandlers.usersCheckRecords(userId)
    : usersHandlers.checkHasRecords(userId)
)
ipcMain.handle('users:delete',
  // exported as usersDeleteUser in client.js; adminId not forwarded
  (_, id, adminId) => C
    ? clientHandlers.usersDeleteUser(id)
    : usersHandlers.deleteUser(id, adminId)
)
ipcMain.handle('users:heartbeat', (_, userId) => usersHandlers.heartbeat(userId))

// Audit log — local only (no client.js implementation)
ipcMain.handle('audit:getEntries',       (_, filters) => auditHandlers.getEntries(filters))
ipcMain.handle('audit:getFilterOptions', () => auditHandlers.getFilterOptions())
ipcMain.handle('audit:logImport',        (_, payload) => auditHandlers.logImport(payload))

// Settings
ipcMain.handle('settings:load',
  () => C ? clientHandlers.settingsLoad() : settingsHandlers.load()
)
ipcMain.handle('settings:save',
  (_, data) => C ? clientHandlers.settingsSave(data) : settingsHandlers.save(data)
)

// AI document extraction
ipcMain.handle('ai:extract',        (_, images) => aiHandlers.extract(images))
ipcMain.handle('ai:testConnection', () => aiHandlers.testConnection())

ipcMain.handle('app:getConfig', () => ({ mode: appConfig.mode, serverUrl: appConfig.serverUrl, token: appConfig.token }))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try { require('./database/db').exec('UPDATE users SET is_online = 0') } catch {}
})
