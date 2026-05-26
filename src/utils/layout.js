import { isoToDisplay, isoToDutchDay } from './dates'

// Each day is rendered as its OWN independent block placed side by side. A day
// block only lists the dishes actually ordered that day (no blank-quantity rows),
// and within the block the categories are split across two sub-columns (left /
// right, like the chef's sheet) so it is wider and shorter:
//   [L-name, L-qty, mid-gap, R-name, R-qty, day-gap]
export const PER_DAY_COLS = 6

// Which categories live in the left sub-column; everything else goes right.
const LEFT_COLUMN = new Set([
  'SULU YEMEKLER',
  'IZGARA ET',
  'IZGARA TAVUK',
  'TAVUKLU YEMEKLER',
  'ETLI YEMEKLER',
  'Premium paket',
])

// One sub-column's rows, with a blank spacer above every section for breathing room.
function columnPlan(categories) {
  const plan = []
  for (const cat of categories) {
    plan.push({ type: 'spacer' })
    plan.push({ type: 'category', label: cat.name })
    for (const dish of cat.dishes) {
      plan.push({ type: 'dish', display: dish.display, qty: dish.qty })
    }
  }
  return plan
}

// The left/right column plans for a single day, using only dishes ordered that day.
function dayPlan(kitchen, date) {
  const cats = []
  for (const cat of kitchen.categories) {
    const dishes = cat.dishes
      .filter((d) => (d.perDate[date] || 0) > 0)
      .map((d) => ({ display: d.display, qty: d.perDate[date] }))
    if (dishes.length) cats.push({ name: cat.name, dishes })
  }
  const left = columnPlan(cats.filter((c) => LEFT_COLUMN.has(c.name)))
  const right = columnPlan(cats.filter((c) => !LEFT_COLUMN.has(c.name)))
  return { left, right, height: Math.max(left.length, right.length) }
}

// Build the value grid plus a parallel `meta` grid (cell role per cell) shared by
// the CSV and Excel exporters. Day names are Dutch, to match the chef's sheet.
export function buildGrid(kitchen) {
  const plans = kitchen.dates.map((d) => dayPlan(kitchen, d))
  const bodyHeight = plans.reduce((m, p) => Math.max(m, p.height), 0)

  const rows = 1 + bodyHeight + 2 // day header + tallest body + spacer + total
  const cols = Math.max(kitchen.dates.length * PER_DAY_COLS, 1)
  const grid = Array.from({ length: rows }, () => Array(cols).fill(''))
  const meta = Array.from({ length: rows }, () => Array(cols).fill(''))
  const totalRow = rows - 1 // one shared bottom row for every day's total

  kitchen.dates.forEach((date, di) => {
    const base = di * PER_DAY_COLS
    const lName = base
    const lQty = base + 1
    const mid = base + 2
    const rName = base + 3
    const rQty = base + 4
    const { left, right } = plans[di]

    grid[0][lName] = `${isoToDutchDay(date)} ${isoToDisplay(date)}`
    for (const c of [lName, lQty, mid, rName, rQty]) meta[0][c] = 'header'

    const place = (plan, nameCol, qtyCol) => {
      plan.forEach((row, i) => {
        const r = i + 1
        if (row.type === 'category') {
          grid[r][nameCol] = row.label
          meta[r][nameCol] = 'cat'
          grid[r][qtyCol] = 'Adet'
          meta[r][qtyCol] = 'catAdet'
        } else if (row.type === 'dish') {
          grid[r][nameCol] = row.display
          meta[r][nameCol] = 'dish'
          grid[r][qtyCol] = row.qty
          meta[r][qtyCol] = 'dishQty'
        }
        // spacer rows stay blank
      })
    }
    place(left, lName, lQty)
    place(right, rName, rQty)

    // Every day's total sits on the same bottom row, so all GÜN TOPLAMI cells are
    // aligned. Only this bottom row is tall; content rows keep their normal height.
    for (const c of [lName, lQty, mid, rName, rQty]) meta[totalRow][c] = 'total'
    grid[totalRow][lName] = 'GÜN TOPLAMI'
    grid[totalRow][lQty] = kitchen.dayTotals[date] || 0
    meta[totalRow][lQty] = 'totalQty'
  })

  return {
    grid,
    meta,
    rows,
    cols,
    dates: kitchen.dates,
    perDayCols: PER_DAY_COLS,
  }
}
