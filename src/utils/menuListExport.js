// The chef's-box contents file ("YYYY-MM-DD-Menu_list_export.xlsx"). Its "Data
// Sheet" maps each box (Course Information) to its dishes (Recipe Information):
//   Şefin Kutusu 5 Günlük  ->  [dishes...]
//   Şefin Kutusu 7 Günlük  ->  [dishes...]
// The date in the filename is intentionally ignored — this file is uploaded once
// and reused for the week; the delivery dates come from the kitchen-overview CSV.

const FIVE_DAY = /5\s*g[üu]nl[üu]k/i
const SEVEN_DAY = /7\s*g[üu]nl[üu]k/i

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

export async function parseMenuListExport(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  const ws = wb.getWorksheet('Data Sheet') || wb.worksheets[0]
  if (!ws) throw new Error('Data Sheet bulunamadı')

  // Dedupe per box: a dish listed twice in a box still counts once.
  const five = new Map()
  const seven = new Map()
  ws.eachRow((row) => {
    const course = cellText(row.getCell(1)).trim()
    const dish = cellText(row.getCell(2)).trim()
    if (!course || !dish) return
    const lc = course.toLowerCase()
    if (lc === 'name' || lc.includes('course information')) return
    if (FIVE_DAY.test(course)) five.set(dish.toLowerCase(), dish)
    else if (SEVEN_DAY.test(course)) seven.set(dish.toLowerCase(), dish)
  })

  const fiveDay = [...five.values()]
  const sevenDay = [...seven.values()]
  if (fiveDay.length === 0 && sevenDay.length === 0) {
    throw new Error('Şefin Kutusu içeriği okunamadı (5/7 günlük bulunamadı)')
  }

  return {
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    fiveDay,
    sevenDay,
  }
}
