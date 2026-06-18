import { differenceInMinutes, parseISO } from 'date-fns'

export function getLIndex(loa) {
  return 1 + (loa > 75 ? 1 : 0) + (loa > 125 ? 1 : 0) + (loa > 175 ? 1 : 0)
}

export function splitDayBlocks(days) {
  const d1 = Math.min(days, 5)
  const d2 = Math.min(Math.max(days - 5, 0), 10)
  const d3 = Math.max(days - 15, 0)
  return { d1, d2, d3 }
}

export function calcDays(ata, atd) {
  const diffMinutes = differenceInMinutes(parseISO(atd), parseISO(ata))
  return Math.max(Math.ceil(diffMinutes / 1440), 1)
}

export function calcMaintenanceFee(maintenance, days, loa) {
  return maintenance === 'Yes' ? 3 * days * loa : 0
}

export function calcBerthingFee({ loa, days, position, vesselCategory, maintenance, rates, minimums, categories }) {
  const lIndex = getLIndex(loa)

  if (position === 'Congestion') {
    return {
      lIndex,
      d1Days: 0, d2Days: 0, d3Days: 0,
      rawFee: 0, discountFactor: 1.0, feeAfterDiscount: 0,
      minFee: 0, maintenanceFee: 0, finalFee: 0,
    }
  }

  const { d1, d2, d3 } = splitDayBlocks(days)

  let rawFee
  if (position === 'Quay') {
    const r1 = rates['Quay']['D1'][lIndex]
    const r2 = rates['Quay']['D2'][lIndex]
    const r3 = rates['Quay']['D3'][lIndex]
    rawFee = (d1 * r1 + d2 * r2 + d3 * r3) * loa
  } else if (position === 'En Rade') {
    rawFee = days * 1 * loa
  } else {
    const r = rates[position]['ALL'][lIndex]
    rawFee = days * r * loa
  }

  const discountFactor = (vesselCategory && categories[vesselCategory] !== undefined)
    ? categories[vesselCategory]
    : 1.0

  const feeAfterDiscount = rawFee * discountFactor
  const minFee = minimums[position][lIndex]
  // Minimum is NOT applied here — it is applied at receipt time in receiptCalc.js
  // against the combined total of all berthing rows for the voyage.
  const maintenanceFee = calcMaintenanceFee(maintenance, days, loa)
  const finalFee = feeAfterDiscount + maintenanceFee

  return {
    lIndex,
    d1Days: d1, d2Days: d2, d3Days: d3,
    rawFee,
    discountFactor,
    feeAfterDiscount,
    minFee,
    maintenanceFee,
    finalFee,
  }
}
