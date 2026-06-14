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

- vessel_type: if the document mentions containers, TEUs, 20ft, 40ft → set to "Container". If it mentions tons, cargo, general → set to "General Cargo". Only mark uncertain if there is truly no indication of vessel type in the document.

- flag: may be labeled "vessel flag", "flag", "علم", or similar.

- loa: the vessel length, may be labeled "length", "LOA", "طول الباخرة بالأمتار", or similar. Return as a plain number.

- ata / atd: arrival and departure dates. May be labeled "ATA", "ATD", "Arrival Date", "Departure Date", "تاريخ وصول الباخرة", "تاريخ مغادرة الباخرة". Format all dates as DD/MM/YYYY. Ignore time portions.

- berthing: may appear under sections labeled "berth", "Berthing Fees", "رسوم على السفن", or similar.
  - "position" comes from either the "berth name" column (e.g. "Quay 16: bollard 00, level 1") or a "Code" column (e.g. "QUAY", "POS_2", "En Rade"). Return the raw value exactly as it appears — do not interpret or translate it.
  - "days" comes from "nbr of days" or "Days-أيام" or equivalent column.
  - "total" comes from "Amt-$" or equivalent. If no total is present in the berthing section, set to null.
  - If the document has only one berthing line, return an array with one object.
  - If no berthing section exists at all, return [].

- services: extract service lines from EVERY section of the document — the main service table AND any separate sections (port dues, quay charges, overtime, authority fees, or any additional charge tables). Do not skip any section. If a section has a code, quantity, and price, extract each line.
  - PA-BC and QU-BC are critical service codes that appear in a dedicated separate section (not the main table). They MUST be extracted as service lines with their exact codes.
  - Do not include any service line where the code begins with "RS" (e.g. RS1, RS-20, RSHIP, RS, etc.). These are silently dropped.
  - Some codes may appear split across two lines due to column width (e.g. "TRST" on one line and "D" on the next). Reconstruct them as a single code (e.g. "TRSTD").

- container_size:
  - "20ft", "20'", "20_FT", "FT_20", "FT20", "TEU" → "20ft"
  - "40ft", "40'", "40_FT", "FT_40", "FT40", "FEU" → "40ft"
  - In documents with two separate service tables (one labeled for 20ft containers, one for 40ft), assign container_size based on which table the line belongs to — not just the unit column value.
  - If genuinely ambiguous, set to null.
  - For non-container service lines, set container_size to null.

- quantity: in documents with two quantity columns, use the second quantity column (the one paired with the FT_20/FT_40 unit) as the real quantity value.

- price_per_unit: may be labeled "U/P", "إفرادي", "unit price", or similar. Return as a plain number, no currency symbols.

- line_total: may be labeled "Amt-$", "المبلغ", "total", or similar. Return as a plain number.

Rules for uncertain_fields:
- Only add a field to uncertain_fields if its value is NULL (not found at all) or if you genuinely cannot read it (blurry, cut off, ambiguous).
- Do NOT add a field to uncertain_fields just because you had to infer it.
- Do NOT mark voyage_number uncertain if you found a number and assigned it.
- Do NOT mark vessel_type uncertain unless there is truly no indication in the document.

Numbers must be plain numbers with no currency symbols, commas, or units.
Dates must be formatted as DD/MM/YYYY.`

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
