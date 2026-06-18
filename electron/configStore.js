// Singleton that reads C:\Users\<user>\AppData\Roaming\Ship Fees\config.json once
// and caches the result. Falls back to server mode if the file is absent or malformed.
const path = require('path')
const fs   = require('fs')
const { app } = require('electron')

let _config = null

function getConfig() {
  if (_config) return _config
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json')
    const raw = fs.readFileSync(configPath, 'utf-8')
    _config = JSON.parse(raw)
  } catch {
    _config = { mode: 'server' }
  }
  return _config
}

module.exports = { getConfig }
