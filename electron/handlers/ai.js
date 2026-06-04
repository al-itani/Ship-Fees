const fs   = require('fs')
const path = require('path')

const SETTINGS_PATH = 'C:\\ShipFees\\config\\settings.json'

function getApiKey() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return null
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
    return parsed.anthropic_api_key || null
  } catch {
    return null
  }
}

const EXTRACTION_PROMPT = `You are extracting structured data from a port shipping receipt or manifest.

Return ONLY a valid JSON object with no explanation, no markdown, no preamble.

Extract the following fields. If a field is not found, set its value to null.

{
  "voyage_number": string or null,
  "vessel_name": string or null,
  "vessel_type": "General Cargo" | "Container" | null,
  "flag": string or null,
  "shipping_agent": string or null,
  "loa": number or null,
  "ata": "DD/MM/YYYY" or null,
  "atd": "DD/MM/YYYY" or null,
  "berthing": [
    {
      "position": string or null,
      "days": number or null,
      "total": number or null
    }
  ],
  "services": [
    {
      "code": string or null,
      "container_size": "20ft" | "40ft" | null,
      "quantity": number or null,
      "price_per_unit": number or null,
      "line_total": number or null
    }
  ],
  "uncertain_fields": [string]
}

Field notes:
- voyage_number: appears as a large number near the top, often labeled "Voyage", "رحلة", "Viaje", or similar. If a bill number is present with no separate voyage number, use it as voyage_number.
- vessel_type: if the document mentions containers, TEUs, 20ft, 40ft → set to "Container". If it mentions tons, cargo, general → set to "General Cargo".
- berthing position: return the raw value exactly as it appears in the document (e.g. "POS_2", "Quay", "En Rade", "Position 1"). Do not interpret or translate it — the app will map it to the correct position name.

Rules for uncertain_fields:
- Only add a field to uncertain_fields if its value is NULL (not found at all) or if you genuinely cannot read it (blurry, cut off, ambiguous).
- Do NOT add a field to uncertain_fields just because you had to infer it.
- vessel_type: only mark uncertain if there is truly no indication of vessel type in the document.
- voyage_number: if you found a number and assigned it, do NOT mark it uncertain.

Service extraction scope:
- Extract service lines from EVERY section of the document — the main service table AND any separate sections (port dues, quay charges, overtime, authority fees, or any additional charge tables).
- PA-BC and QU-BC are critical service codes that appear in a dedicated separate section (not the main table). They MUST be extracted as service lines with their exact codes.
- Do not skip any section. If a section has a code, quantity, and price, extract each line.

Service code exclusion:
- Do not include any service line where the code begins with "RS" (e.g. RS1, RS-20, RSHIP, etc.).
- These codes are silently dropped.

For container service lines:
- Identify whether the line refers to 20ft or 40ft containers.
- "20", "20ft", "20'", "TEU" → "20ft". "40", "40ft", "40'", "FEU" → "40ft".
- Set container_size accordingly. If genuinely ambiguous, set container_size to null.

Dates must be formatted as DD/MM/YYYY.
Numbers must be plain numbers with no currency symbols or commas.`

async function extract(images) {
  const apiKey = getApiKey()
  if (!apiKey) return { success: false, error: 'no_api_key' }
  if (!apiKey.startsWith('sk-ant-')) return { success: false, error: 'invalid_api_key_format' }

  // images: [{ data: base64, mediaType: string }, ...]
  const imageBlocks = images.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }))

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':           apiKey,
        'anthropic-version':   '2023-06-01',
        'content-type':        'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        }],
      }),
    })

    if (response.status === 401) return { success: false, error: 'invalid_api_key' }
    if (!response.ok) {
      let detail = ''
      try { detail = (await response.json()).error?.message || '' } catch {}
      console.error('[ai:extract] API error', response.status, detail)
      return { success: false, error: `api_error_${response.status}`, detail }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text
    if (!text) return { success: false, error: 'empty_response' }

    // Strip markdown code fences if Claude wraps in ```json
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/m, '').trim()

    let parsed
    try { parsed = JSON.parse(cleaned) }
    catch (e) {
      console.error('[ai:extract] JSON parse failed:', e.message, '\ncleaned text:', cleaned)
      return { success: false, error: 'invalid_json', detail: cleaned.slice(0, 200) }
    }
    return { success: true, data: parsed }
  } catch (err) {
    const code = err?.cause?.code
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
      return { success: false, error: 'network_error' }
    }
    return { success: false, error: err.message }
  }
}

async function testConnection() {
  const apiKey = getApiKey()
  if (!apiKey) return { success: false, error: 'no_api_key' }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages:   [{ role: 'user', content: 'ping' }],
      }),
    })
    if (response.status === 401) return { success: false, error: 'invalid_api_key' }
    if (!response.ok)            return { success: false, error: `api_error_${response.status}` }
    return { success: true }
  } catch {
    return { success: false, error: 'network_error' }
  }
}

module.exports = { extract, testConnection }
