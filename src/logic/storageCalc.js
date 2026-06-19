// Storage fee calculation — ported verbatim from storage_calculator.html
const FREE_DAYS       = 9
const GRAIN_FREE_DAYS = 12
const IRON_BLOCK_RATES = [2.4, 4, 6]

const V_RATES = {
  small: [8,  9,  10, 11, 12, 13, 13, 13],
  car:   [16, 17, 18, 20, 25, 30, 30, 30],
  big:   [30, 35, 40, 45, 50, 55, 60, 70],
}
const V_DAILY_CAP = { small: 13, car: 30, big: 80 }

const C_RATES = {
  20: [20,  30,  40,  50,  60,  70,  80,  90, 100],
  40: [30,  45,  60,  75,  90, 105, 120, 135, 150],
}

const GC_RATES = [3, 4, 6]

const FORCED_DAILY = {
  vehicle:         3,
  vehicle_transit: 3,
  container:       5,
  gc:              1,
  iron:            1,
  grain:           1,
}

function vRate(size, period) {
  const t = V_RATES[size]
  return t[Math.min(period - 1, t.length - 1)]
}

function cRate(size, period) {
  const t = C_RATES[size]
  return t[Math.min(period - 1, t.length - 1)]
}

function gcRate(block) {
  return GC_RATES[Math.min(block - 1, GC_RATES.length - 1)]
}

function ironRate(block) {
  return IRON_BLOCK_RATES[Math.min(block - 1, IRON_BLOCK_RATES.length - 1)]
}

function dayRange(idx, span, totalDays, freeDaysOffset) {
  const fd    = freeDaysOffset !== undefined ? freeDaysOffset : FREE_DAYS
  const start = fd + (idx - 1) * span + 1
  const end   = Math.min(fd + idx * span, totalDays)
  return start === end ? `Day ${start}` : `Day ${start}–${end}`
}

export function calcVehicle(days, size, forced) {
  if (forced) {
    return { type: 'forced', fee: days * FORCED_DAILY.vehicle, days, dailyRate: FORCED_DAILY.vehicle }
  }
  const chargeable = Math.max(days - FREE_DAYS, 0)
  if (chargeable === 0) return { type: 'free', fee: 0, days }

  const periods = Math.ceil(chargeable / 3)
  const rows = []
  let sum = 0
  for (let p = 1; p <= periods; p++) {
    const r = vRate(size, p)
    sum += r
    rows.push({ label: '#' + p, dayRange: dayRange(p, 3, days), rate: r, cumul: sum })
  }
  const cap    = V_DAILY_CAP[size] * days
  const capped = sum > cap
  const fee    = Math.min(sum, cap)
  return { type: 'periods', fee, days, chargeable, periods, rows, sum, cap, capped }
}

export function calcVehicleTransit(days, forced) {
  if (forced) {
    return { type: 'forced', fee: days * FORCED_DAILY.vehicle_transit, days, dailyRate: FORCED_DAILY.vehicle_transit }
  }
  const chargeable = Math.max(days - FREE_DAYS, 0)
  if (chargeable === 0) return { type: 'free', fee: 0, days }

  const periods = Math.ceil(chargeable / 3)
  const rows = []
  let sum = 0
  for (let p = 1; p <= periods; p++) {
    sum += 16
    rows.push({ label: '#' + p, dayRange: dayRange(p, 3, days), rate: 16, cumul: sum })
  }
  return { type: 'periods', fee: sum, days, chargeable, periods, rows, sum }
}

export function calcContainer(days, size, status) {
  const sz = parseInt(size, 10)
  if (status === 'forced') {
    return { type: 'forced', fee: days * FORCED_DAILY.container, days, dailyRate: FORCED_DAILY.container }
  }
  const chargeable = Math.max(days - FREE_DAYS, 0)
  if (chargeable === 0) return { type: 'free', fee: 0, days }

  if (status === 'transit' || status === 'export') {
    const periods = Math.ceil(chargeable / 3)
    return { type: 'transit', fee: periods * 20, days, chargeable, periods, status }
  }

  const periods = Math.ceil(chargeable / 3)
  const rows = []
  let sum = 0
  for (let p = 1; p <= periods; p++) {
    const r = cRate(sz, p)
    sum += r
    rows.push({ label: '#' + p, dayRange: dayRange(p, 3, days), rate: r, cumul: sum })
  }
  return { type: 'periods', fee: sum, days, chargeable, periods, rows, sum }
}

export function calcGC(days, tons, forced) {
  if (forced) {
    return { type: 'forced', fee: days * FORCED_DAILY.gc * tons, days, tons, dailyRate: FORCED_DAILY.gc }
  }
  const chargeable = Math.max(days - FREE_DAYS, 0)
  if (chargeable === 0) return { type: 'free', fee: 0, days }

  const blocks = Math.ceil(chargeable / 9)
  const rows = []
  let sum = 0
  for (let b = 1; b <= blocks; b++) {
    const r = gcRate(b)
    const blockFee = r * tons
    sum += blockFee
    rows.push({ label: '#' + b, dayRange: dayRange(b, 9, days), ratePerTon: r, tons, blockFee, cumul: sum })
  }
  return { type: 'blocks', fee: sum, days, chargeable, blocks, tons, rows, sum }
}

export function calcIron(days, tons, forced) {
  if (forced) {
    return { type: 'forced', fee: days * FORCED_DAILY.iron * tons, days, tons, dailyRate: FORCED_DAILY.iron }
  }
  const chargeable = Math.max(days - FREE_DAYS, 0)
  if (chargeable === 0) return { type: 'free', fee: 0, days }

  const blocks = Math.ceil(chargeable / 9)
  const rows = []
  let sum = 0
  for (let b = 1; b <= blocks; b++) {
    const r = ironRate(b)
    const blockFee = r * tons
    sum += blockFee
    rows.push({ label: '#' + b, dayRange: dayRange(b, 9, days), ratePerTon: r, tons, blockFee, cumul: sum })
  }
  return { type: 'blocks', fee: sum, days, chargeable, blocks, tons, rows, sum }
}

export function calcGrain(days, tons, forced) {
  if (forced) {
    return {
      type: 'forced',
      fee: days * FORCED_DAILY.grain * tons,
      days, tons,
      dailyRate: FORCED_DAILY.grain,
      freeDays: GRAIN_FREE_DAYS,
    }
  }
  const chargeable = Math.max(days - GRAIN_FREE_DAYS, 0)
  if (chargeable === 0) return { type: 'free', fee: 0, days, freeDays: GRAIN_FREE_DAYS }

  const blocks = Math.ceil(chargeable / 9)
  const rows = []
  let sum = 0
  for (let b = 1; b <= blocks; b++) {
    const r = gcRate(b)
    const blockFee = r * tons
    sum += blockFee
    rows.push({ label: '#' + b, dayRange: dayRange(b, 9, days, GRAIN_FREE_DAYS), ratePerTon: r, tons, blockFee, cumul: sum })
  }
  const fee = sum * 0.5
  return { type: 'blocks', fee, days, chargeable, blocks, tons, rows, sum, grainDiscount: true, freeDays: GRAIN_FREE_DAYS }
}

export function calculateStorage({ cargoType, status, days, vehicleSize, containerSize, tons }) {
  switch (cargoType) {
    case 'vehicle':         return calcVehicle(days, vehicleSize || 'car', status === 'forced')
    case 'vehicle_transit': return calcVehicleTransit(days, status === 'forced')
    case 'container':       return calcContainer(days, containerSize || '20', status)
    case 'iron':            return calcIron(days, tons, status === 'forced')
    case 'grain':           return calcGrain(days, tons, status === 'forced')
    case 'gc':              return calcGC(days, tons, status === 'forced')
    default:                return null
  }
}
