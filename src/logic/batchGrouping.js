// Pure grouping logic for the Batch Import flow (no IPC, no React).
// Files photographed within BATCH_GROUP_THRESHOLD_SECONDS of the previous
// file are treated as pages of the same receipt.

export const BATCH_GROUP_THRESHOLD_SECONDS = 12

// Samsung default camera filenames: YYYYMMDD_HHMMSS.jpg (e.g. 20260612_091530.jpg)
const FILENAME_TS = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/

export function parseFilenameTimestamp(filename) {
  const m = FILENAME_TS.exec(String(filename || '').trim())
  if (!m) return null
  const y  = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const h  = Number(m[4]), mi = Number(m[5]), s = Number(m[6])
  const date = new Date(y, mo - 1, d, h, mi, s)
  // Reject impossible components (e.g. month 13) that Date would silently roll over
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d ||
      date.getHours() !== h || date.getMinutes() !== mi || date.getSeconds() !== s) return null
  return date.getTime()
}

let uidCounter = 0
export function nextId(prefix) {
  uidCounter += 1
  return `${prefix}${uidCounter}`
}

function newGroup(pages) {
  return { id: nextId('g'), pages, status: 'waiting', error: null, result: null, review: null, voyageNumber: null }
}

// files: [{ id, filename, images, timestamp }] — timestamp in epoch ms or null.
// Files without a usable timestamp each go into their own group of 1.
export function buildGroups(files) {
  const dated   = files.filter(f => f.timestamp != null).sort((a, b) => a.timestamp - b.timestamp)
  const undated = files.filter(f => f.timestamp == null)

  const groups = []
  for (const file of dated) {
    const last = groups[groups.length - 1]
    const prev = last?.pages[last.pages.length - 1]
    if (prev && file.timestamp - prev.timestamp <= BATCH_GROUP_THRESHOLD_SECONDS * 1000) {
      last.pages = [...last.pages, file]
    } else {
      groups.push(newGroup([file]))
    }
  }
  for (const file of undated) groups.push(newGroup([file]))
  return groups
}

// Move a page into targetGroupId, before beforePageId (or appended when null).
// Covers drag between groups and reordering within a group. Empty groups are dropped.
export function movePage(groups, pageId, targetGroupId, beforePageId = null) {
  if (pageId === beforePageId) return groups
  let moved = null
  let out = groups.map(g => {
    if (!g.pages.some(p => p.id === pageId)) return g
    moved = g.pages.find(p => p.id === pageId)
    return { ...g, pages: g.pages.filter(p => p.id !== pageId) }
  })
  if (!moved) return groups
  out = out.map(g => {
    if (g.id !== targetGroupId) return g
    const pages = [...g.pages]
    const at = beforePageId ? pages.findIndex(p => p.id === beforePageId) : -1
    if (at === -1) pages.push(moved)
    else pages.splice(at, 0, moved)
    return { ...g, pages }
  })
  return out.filter(g => g.pages.length > 0)
}

// Remove a page into its own new group, inserted right after its source group.
export function splitPage(groups, pageId) {
  const srcIdx = groups.findIndex(g => g.pages.some(p => p.id === pageId))
  if (srcIdx === -1) return groups
  const src = groups[srcIdx]
  if (src.pages.length === 1) return groups
  const page = src.pages.find(p => p.id === pageId)
  const out = [...groups]
  out[srcIdx] = { ...src, pages: src.pages.filter(p => p.id !== pageId) }
  out.splice(srcIdx + 1, 0, newGroup([page]))
  return out
}

// Drop target "create a new receipt": page becomes its own group at the end.
export function movePageToNewGroup(groups, pageId) {
  const src = groups.find(g => g.pages.some(p => p.id === pageId))
  if (!src) return groups
  if (src.pages.length === 1 && groups[groups.length - 1] === src) return groups
  const page = src.pages.find(p => p.id === pageId)
  const out = groups
    .map(g => g.id === src.id ? { ...g, pages: g.pages.filter(p => p.id !== pageId) } : g)
    .filter(g => g.pages.length > 0)
  out.push(newGroup([page]))
  return out
}

export function mergeWithPrevious(groups, groupId) {
  const i = groups.findIndex(g => g.id === groupId)
  if (i <= 0) return groups
  const out = [...groups]
  out[i - 1] = { ...out[i - 1], pages: [...out[i - 1].pages, ...out[i].pages] }
  out.splice(i, 1)
  return out
}
