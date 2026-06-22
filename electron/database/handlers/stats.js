const db = require('../db')

function log({ user_id, username, action_type, api_endpoint, detail }) {
  try {
    db.prepare(`
      INSERT INTO usage_stats (user_id, username, action_type, api_endpoint, detail)
      VALUES (?, ?, ?, ?, ?)
    `).run(user_id || null, username || null, action_type, api_endpoint || null, detail ? JSON.stringify(detail) : null)
    return { success: true }
  } catch (err) { return { success: false, error: err.message } }
}

function getStats({ user_id, action_type, date_from, date_to, limit = 50, offset = 0 } = {}) {
  try {
    const conditions = []
    const params = []

    if (user_id)     { conditions.push('s.user_id = ?');     params.push(user_id) }
    if (action_type) { conditions.push('s.action_type = ?'); params.push(action_type) }
    if (date_from)   { conditions.push('s.created_at >= ?'); params.push(date_from) }
    if (date_to)     { conditions.push('s.created_at <= ?'); params.push(date_to + ' 23:59:59') }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    const rows = db.prepare(`
      SELECT s.id, s.user_id, s.username, s.action_type, s.api_endpoint, s.detail, s.created_at
      FROM usage_stats s
      ${where}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    const total = db.prepare(`
      SELECT COUNT(*) as c FROM usage_stats s ${where}
    `).get(...params).c

    return { success: true, data: rows, total }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { log, getStats }
