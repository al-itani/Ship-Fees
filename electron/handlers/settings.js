const path = require('path')
const fs   = require('fs')

const SETTINGS_DIR  = 'C:\\ShipFees\\config'
const SETTINGS_PATH = path.join(SETTINGS_DIR, 'settings.json')

function ensureFile() {
  if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true })
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ anthropic_api_key: '' }, null, 2))
  }
}

function load() {
  try {
    ensureFile()
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
    return { success: true, data: { apiKey: parsed.anthropic_api_key || '' } }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function save({ apiKey }) {
  try {
    ensureFile()
    let current = {}
    try { current = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) } catch {}
    current.anthropic_api_key = apiKey || ''
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(current, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { load, save }
