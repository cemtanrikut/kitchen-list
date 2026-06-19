// The chef's-box contents file ("YYYY-MM-DD-Menu_list_export.xlsx"). Its "Data
// Sheet" maps each box (Course Information) to its dishes (Recipe Information):
//   Şefin Kutusu 5 Günlük  ->  [dishes...]
//   Şefin Kutusu 6 Günlük  ->  [dishes...]
//   Şefin Kutusu 7 Günlük  ->  [dishes...]
// The apicbase export puts the box label under the "Course Information / name"
// column and the dish under "Recipe Information / name" (currently columns K and
// L). We locate those columns from the two header rows instead of hard-coding
// K/L, so a future column shift doesn't silently break parsing the way the
// A/B → K/L move did. "Chef's Special" rows match no day box and are ignored.
// The date in the filename is intentionally ignored — this file is uploaded once
// and reused for the week; the delivery dates come from the kitchen-overview CSV.
//
// A second, simpler export shape is also supported: a single "name"/"name" header
// row with the box label in column A and the dish in column B (no section row, no
// apicbase ID columns). When the header-based detection above finds nothing, we
// fall back to locating the columns from the data itself (findColumnsByContent).

const FIVE_DAY = /5\s*g[üu]nl[üu]k/i
const SIX_DAY = /6\s*g[üu]nl[üu]k/i
const SEVEN_DAY = /7\s*g[üu]nl[üu]k/i

// Classify a box label into its day bucket, or null if it isn't a day box
// ("Chef's Special" and header text return null and are ignored).
function dayBox(text) {
  if (FIVE_DAY.test(text)) return 'five'
  if (SIX_DAY.test(text)) return 'six'
  if (SEVEN_DAY.test(text)) return 'seven'
  return null
}

// Fallback columns when the header rows can't be matched: K = box label, L = dish.
const COURSE_FALLBACK_COL = 11 // K
const RECIPE_FALLBACK_COL = 12 // L

export function isMenuListExport(file) {
  const n = file.name.toLowerCase()
  return n.endsWith('.xlsx') && /menu[_\s-]*list[_\s-]*export/.test(n)
}

export function isXlsx(file) {
  return (
    file.name.toLowerCase().endsWith('.xlsx') ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

function cellText(cell) {
  const v = cell?.value
  if (v == null) return ''
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('')
    if (v.text != null) return String(v.text)
    if (v.result != null) return String(v.result)
    return ''
  }
  return String(v)
}

// Find the box-label and dish columns from the two header rows. Row 1 holds the
// section ("Course Information" / "Recipe Information"); row 2 holds the field
// name. The dish lives in the Recipe column whose field is "name" (the sibling
// Recipe column holds an apicbase ID). Falls back to K/L if not found.
function findColumns(ws) {
  const section = ws.getRow(1)
  const field = ws.getRow(2)
  let courseCol = null
  let recipeCol = null
  const limit = Math.max(ws.columnCount || 0, RECIPE_FALLBACK_COL)
  for (let c = 1; c <= limit; c++) {
    if (cellText(field.getCell(c)).trim().toLowerCase() !== 'name') continue
    const sec = cellText(section.getCell(c)).trim().toLowerCase()
    if (courseCol == null && sec.includes('course information')) courseCol = c
    else if (recipeCol == null && sec.includes('recipe information')) recipeCol = c
  }
  return {
    courseCol: courseCol ?? COURSE_FALLBACK_COL,
    recipeCol: recipeCol ?? RECIPE_FALLBACK_COL,
  }
}

// 1-based column index holding the largest count, or 0 if every count is empty.
function argMaxColumn(counts) {
  let bestCol = 0
  let best = 0
  for (let c = 1; c < counts.length; c++) {
    if ((counts[c] || 0) > best) {
      best = counts[c]
      bestCol = c
    }
  }
  return bestCol
}

// Fallback for exports without the two-row apicbase header (e.g. a single
// "name"/"name" header with the box in column A and the dish in column B). The
// box column is whichever column actually holds day-box labels; the dish column
// is the other column populated on those same rows (scanned left-to-right, so the
// dish — conventionally just right of the box — wins ties).
function findColumnsByContent(ws) {
  const limit = Math.max(ws.columnCount || 0, RECIPE_FALLBACK_COL)
  const boxHits = []
  ws.eachRow((row) => {
    for (let c = 1; c <= limit; c++) {
      if (dayBox(cellText(row.getCell(c)).trim())) boxHits[c] = (boxHits[c] || 0) + 1
    }
  })
  const courseCol = argMaxColumn(boxHits)
  if (!courseCol) return null

  const dishHits = []
  ws.eachRow((row) => {
    if (!dayBox(cellText(row.getCell(courseCol)).trim())) return
    for (let c = 1; c <= limit; c++) {
      if (c !== courseCol && cellText(row.getCell(c)).trim()) {
        dishHits[c] = (dishHits[c] || 0) + 1
      }
    }
  })
  const recipeCol = argMaxColumn(dishHits)
  if (!recipeCol) return null

  return { courseCol, recipeCol }
}

// Map each box (courseCol) to its deduped dishes (recipeCol). A dish listed twice
// in a box still counts once; header rows and non-day boxes are skipped.
function collectBoxes(ws, courseCol, recipeCol) {
  const buckets = { five: new Map(), six: new Map(), seven: new Map() }
  ws.eachRow((row) => {
    const course = cellText(row.getCell(courseCol)).trim()
    const dish = cellText(row.getCell(recipeCol)).trim()
    if (!course || !dish) return
    const lc = course.toLowerCase()
    if (lc === 'name' || lc.includes('course information')) return
    const box = dayBox(course)
    if (box) buckets[box].set(dish.toLowerCase(), dish)
  })
  return {
    fiveDay: [...buckets.five.values()],
    sixDay: [...buckets.six.values()],
    sevenDay: [...buckets.seven.values()],
  }
}

function boxCount(boxes) {
  return boxes.fiveDay.length + boxes.sixDay.length + boxes.sevenDay.length
}

export async function parseMenuListExport(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  const ws = wb.getWorksheet('Data Sheet') || wb.worksheets[0]
  if (!ws) throw new Error('Data Sheet bulunamadı')

  // Header-based detection handles the full apicbase export. When it finds no
  // boxes (a differently-shaped sheet such as a bare "name"/"name" header), fall
  // back to detecting the columns from the data itself before giving up.
  const header = findColumns(ws)
  let boxes = collectBoxes(ws, header.courseCol, header.recipeCol)
  if (boxCount(boxes) === 0) {
    const alt = findColumnsByContent(ws)
    if (alt) boxes = collectBoxes(ws, alt.courseCol, alt.recipeCol)
  }
  if (boxCount(boxes) === 0) {
    throw new Error('Şefin Kutusu içeriği okunamadı (5/6/7 günlük bulunamadı)')
  }

  return {
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    ...boxes,
  }
}
