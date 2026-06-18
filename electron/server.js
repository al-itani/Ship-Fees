// Local HTTP API server — exposes the existing handlers over REST for external
// integrations. Runs inside the Electron main process on port 3001.
//
// Every handler already returns its own { success, data | error } object and
// catches internally; the per-endpoint try/catch here only guards against
// thrown exceptions (e.g. bad input). Per spec, a successful call responds with
// { success: true, data: <handler result> } and a thrown error responds with
// { success: false, error: err.message }.

const express = require('express')
const fs   = require('fs')
const path = require('path')

const app = express()
app.use(express.json({ limit: '10mb' }))

// Handlers — all export plain functions, called with plain args (no IPC event).
const authHandlers      = require('./database/handlers/auth')
const berthingHandlers  = require('./database/handlers/berthing')
const containerHandlers = require('./database/handlers/container')
const gcHandlers        = require('./database/handlers/gc')
const receiptHandlers   = require('./database/handlers/receipts')
const cmaHandlers       = require('./database/handlers/cma')
const usersHandlers     = require('./database/handlers/users')

// Settings handler lives at ./handlers/settings; fall back to the database/
// handlers path only if the primary location is absent.
const settingsHandlers = fs.existsSync(path.join(__dirname, 'handlers', 'settings.js'))
  ? require('./handlers/settings')
  : require('./database/handlers/settings')

// Auth gate — every request must carry the shared secret header.
app.use((req, res, next) => {
  if (req.headers['x-token'] !== 'SHIPFEES_SECRET') {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

// Wraps a handler call: thrown error → { success: false }, otherwise
// { success: true, data: <result> }.
function handle(res, fn) {
  try {
    const result = fn()
    res.json({ success: true, data: result })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────
// Login is unwrapped manually so `data` contains the user object directly,
// not the handler's { success, user } envelope.
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  try {
    const result = authHandlers.login(username, password)
    if (!result.success) return res.json({ success: false, error: result.error })
    res.json({ success: true, data: result.user })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})
// Real signature is changePassword(userId, newPassword) — no current-password check.
app.post('/api/auth/changePassword', (req, res) => {
  const { userId, newPassword } = req.body
  handle(res, () => authHandlers.changePassword(userId, newPassword))
})

// ── Berthing ─────────────────────────────────────────────────────────────
app.post('/api/berthing/getRates',  (req, res) => handle(res, () => berthingHandlers.getRates()))
app.post('/api/berthing/getAgents', (req, res) => handle(res, () => berthingHandlers.getAgents()))
app.post('/api/berthing/save',      (req, res) => handle(res, () => berthingHandlers.save(req.body)))
app.post('/api/berthing/getAll',    (req, res) => handle(res, () => berthingHandlers.getAll()))
app.post('/api/berthing/update', (req, res) => {
  const { id, data } = req.body
  handle(res, () => berthingHandlers.update(id, data))
})
// Real signature is softDelete(id, userId, opts).
app.post('/api/berthing/delete', (req, res) => {
  const { id, deletedBy, opts } = req.body
  handle(res, () => berthingHandlers.softDelete(id, deletedBy, opts))
})

// ── Container ────────────────────────────────────────────────────────────
app.post('/api/container/lookupVoyage', (req, res) => {
  const { voyageNumber } = req.body
  handle(res, () => containerHandlers.lookupVoyage(voyageNumber))
})
app.post('/api/container/listVoyages', (req, res) => handle(res, () => containerHandlers.listVoyages()))
app.post('/api/container/getCodes',    (req, res) => handle(res, () => containerHandlers.getCodes()))
// Real signature is saveSession(data) — single object { voyageNumber, vesselName, vesselType, lines, created_by, ... }.
app.post('/api/container/saveSession', (req, res) => handle(res, () => containerHandlers.saveSession(req.body)))
app.post('/api/container/getLines', (req, res) => {
  const { voyageNumber } = req.body
  handle(res, () => containerHandlers.getLines(voyageNumber))
})
app.post('/api/container/deleteLine', (req, res) => {
  const { id, deletedBy } = req.body
  handle(res, () => containerHandlers.deleteLine(id, deletedBy))
})

// ── General Cargo ────────────────────────────────────────────────────────
app.post('/api/gc/lookupVoyage', (req, res) => {
  const { voyageNumber } = req.body
  handle(res, () => gcHandlers.lookupVoyage(voyageNumber))
})
app.post('/api/gc/listVoyages', (req, res) => handle(res, () => gcHandlers.listVoyages()))
app.post('/api/gc/getCodes',    (req, res) => handle(res, () => gcHandlers.getCodes()))
// Real signature is saveSession(data) — single object, same shape as container.
app.post('/api/gc/saveSession', (req, res) => handle(res, () => gcHandlers.saveSession(req.body)))
app.post('/api/gc/getLines', (req, res) => {
  const { voyageNumber } = req.body
  handle(res, () => gcHandlers.getLines(voyageNumber))
})
app.post('/api/gc/deleteLine', (req, res) => {
  const { id, deletedBy } = req.body
  handle(res, () => gcHandlers.deleteLine(id, deletedBy))
})

// ── Receipts ─────────────────────────────────────────────────────────────
// Real export names: getDataForReceipt, saveReceipt, getAll, softDelete, prepareBerthingOnly.
app.post('/api/receipt/getData', (req, res) => {
  const { voyageNumber } = req.body
  handle(res, () => receiptHandlers.getDataForReceipt(voyageNumber))
})
app.post('/api/receipt/save',   (req, res) => handle(res, () => receiptHandlers.saveReceipt(req.body)))
app.post('/api/receipt/getAll', (req, res) => handle(res, () => receiptHandlers.getAll()))
app.post('/api/receipt/delete', (req, res) => {
  const { id, deletedBy } = req.body
  handle(res, () => receiptHandlers.softDelete(id, deletedBy))
})
// Real signature is prepareBerthingOnly(voyageNumber, username).
app.post('/api/receipt/prepareBerthingOnly', (req, res) => {
  const { voyageNumber, username } = req.body
  handle(res, () => receiptHandlers.prepareBerthingOnly(voyageNumber, username))
})

// ── CMA ──────────────────────────────────────────────────────────────────
// Real signature is getReport(year, month) — note the argument order.
app.post('/api/cma/getReport', (req, res) => {
  const { year, month } = req.body
  handle(res, () => cmaHandlers.getReport(year, month))
})

// ── Users ────────────────────────────────────────────────────────────────
app.post('/api/users/getAll', (req, res) => handle(res, () => usersHandlers.getAll()))
// Real signature is create({ username, full_name, role, language, temp_password, admin_id }).
app.post('/api/users/create', (req, res) => handle(res, () => usersHandlers.create(req.body)))
// Real signature is update(id, { full_name, role, language }, admin_id).
app.post('/api/users/update', (req, res) => {
  const { id, data, adminId } = req.body
  handle(res, () => usersHandlers.update(id, data, adminId))
})
// Real signature is resetPassword(id, temp_password, admin_id).
app.post('/api/users/resetPassword', (req, res) => {
  const { id, newPassword, adminId } = req.body
  handle(res, () => usersHandlers.resetPassword(id, newPassword, adminId))
})
// Real signature is setActive(id, isActive, admin_id).
app.post('/api/users/setActive', (req, res) => {
  const { id, isActive, adminId } = req.body
  handle(res, () => usersHandlers.setActive(id, isActive, adminId))
})
app.post('/api/users/getPermissions', (req, res) => {
  const { userId } = req.body
  handle(res, () => usersHandlers.getPermissions(userId))
})
// Real signature is setPermission(user_id, permission_key, grant, admin_id).
app.post('/api/users/setPermission', (req, res) => {
  const { userId, permission, value, adminId } = req.body
  handle(res, () => usersHandlers.setPermission(userId, permission, value, adminId))
})
// Real export name is checkHasRecords(user_id).
app.post('/api/users/checkRecords', (req, res) => {
  const { userId } = req.body
  handle(res, () => usersHandlers.checkHasRecords(userId))
})
// Real export name is deleteUser(id, admin_id).
app.post('/api/users/delete', (req, res) => {
  const { id, adminId } = req.body
  handle(res, () => usersHandlers.deleteUser(id, adminId))
})

// ── Settings ─────────────────────────────────────────────────────────────
app.post('/api/settings/load', (req, res) => handle(res, () => settingsHandlers.load()))
// Real signature is save({ apiKey }).
app.post('/api/settings/save', (req, res) => handle(res, () => settingsHandlers.save(req.body)))

// Single-start guard — repeated calls return the same server instance.
let serverInstance = null
function startServer() {
  if (serverInstance) return serverInstance
  serverInstance = app.listen(3001, () => console.log('API server running on port 3001'))
  return serverInstance
}

module.exports = { startServer }
