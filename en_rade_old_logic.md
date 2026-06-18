# En Rade — Old Fee Logic (replaced 2026-06-18)

## Formula

```
rawFee = days × rates['En Rade']['ALL'][lIndex] × loa
```

`lIndex` is derived from LOA:
| LOA range | lIndex |
|-----------|--------|
| ≤ 75 m    | 1      |
| 76–125 m  | 2      |
| 126–175 m | 3      |
| > 175 m   | 4      |

## Seeded rates (`berthing_rates` table, position = 'En Rade', tier = 'ALL')

| lIndex | Rate ($/m/day) |
|--------|----------------|
| 1      | $1.00          |
| 2      | $1.50          |
| 3      | $2.00          |
| 4      | $3.00          |

## Seeded minimums (`berthing_minimums` table, position = 'En Rade')

| lIndex | Minimum |
|--------|---------|
| 1      | $150    |
| 2      | $250    |
| 3      | $350    |
| 4      | $550    |

## Post-discount / receipt steps (unchanged)

1. `feeAfterDiscount = rawFee × discountFactor` (vessel category discount)
2. Minimum applied at receipt time in `receiptCalc.js` against the combined berthing total
3. Maintenance fee added if applicable: `3 × days × loa`

## Replacement

New formula (flat, no lIndex): `rawFee = days × 1 × loa`  
Change is in `src/logic/berthingCalc.js`.
