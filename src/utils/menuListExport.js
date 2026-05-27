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

const FIVE_DAY = /5\s*g[üu]nl[üu]k/i
const SIX_DAY = /6\s*g[üu]nl[üu]k/i
const SEVEN_DAY = /7\s*g[üu]nl[üu]k/i

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

export async function parseMenuListExport(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  const ws = wb.getWorksheet('Data Sheet') || wb.worksheets[0]
  if (!ws) throw new Error('Data Sheet bulunamadı')

  const { courseCol, recipeCol } = findColumns(ws)

  // Dedupe per box: a dish listed twice in a box still counts once.
  const five = new Map()
  const six = new Map()
  const seven = new Map()
  ws.eachRow((row) => {
    const course = cellText(row.getCell(courseCol)).trim()
    const dish = cellText(row.getCell(recipeCol)).trim()
    if (!course || !dish) return
    const lc = course.toLowerCase()
    if (lc === 'name' || lc.includes('course information')) return
    if (FIVE_DAY.test(course)) five.set(dish.toLowerCase(), dish)
    else if (SIX_DAY.test(course)) six.set(dish.toLowerCase(), dish)
    else if (SEVEN_DAY.test(course)) seven.set(dish.toLowerCase(), dish)
  })

  const fiveDay = [...five.values()]
  const sixDay = [...six.values()]
  const sevenDay = [...seven.values()]
  if (fiveDay.length === 0 && sixDay.length === 0 && sevenDay.length === 0) {
    throw new Error('Şefin Kutusu içeriği okunamadı (5/6/7 günlük bulunamadı)')
  }

  return {
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    fiveDay,
    sixDay,
    sevenDay,
  }
}
