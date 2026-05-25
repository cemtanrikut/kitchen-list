import Papa from 'papaparse'
import {
  ddmmyyyyToIso,
  isoToDutchDay,
  dateRange,
  isValidIso,
} from './dates'

const DUTCH_DAYS = [
  'Maandag',
  'Dinsdag',
  'Woensdag',
  'Donderdag',
  'Vrijdag',
  'Zaterdag',
  'Zondag',
]

export const FILE_TYPES = {
  DAILY_COUNTS: 'daily_counts',
  KITCHEN_OVERVIEW: 'kitchen_overview',
  KITCHEN_LIST_REPORT: 'kitchen_list_report',
  UNKNOWN: 'unknown',
}

export const TYPE_LABELS = {
  [FILE_TYPES.DAILY_COUNTS]: 'Günlük Sayım',
  [FILE_TYPES.KITCHEN_OVERVIEW]: 'Kitchen Overview',
  [FILE_TYPES.KITCHEN_LIST_REPORT]: 'Kitchen List Report',
  [FILE_TYPES.UNKNOWN]: 'Tanınmadı',
}

function cell(row, idx) {
  return (row?.[idx] ?? '').toString().trim()
}

function isRowEmpty(row) {
  if (!row) return true
  return row.every((c) => (c ?? '').toString().trim() === '')
}

function detectType(filename, rows) {
  const lname = filename.toLowerCase()

  if (lname.startsWith('daily_counts')) return FILE_TYPES.DAILY_COUNTS
  if (lname.includes('kitchen-overview')) return FILE_TYPES.KITCHEN_OVERVIEW
  if (lname.includes('kitchen_list_report')) return FILE_TYPES.KITCHEN_LIST_REPORT

  if (cell(rows[0], 0).toLowerCase() === 'tarih') return FILE_TYPES.DAILY_COUNTS
  if (rows.some((r) => cell(r, 0) === 'Gerechtnaam')) {
    return FILE_TYPES.KITCHEN_OVERVIEW
  }
  if (
    rows.length >= 3 &&
    cell(rows[1], 0).toLowerCase() === 'item' &&
    cell(rows[2], 0).toLowerCase().startsWith('grand total')
  ) {
    return FILE_TYPES.KITCHEN_LIST_REPORT
  }

  return FILE_TYPES.UNKNOWN
}

function parseDailyCounts(filename, rows) {
  let dateIso = null

  if (cell(rows[0], 0).toLowerCase() === 'tarih') {
    dateIso = ddmmyyyyToIso(cell(rows[0], 1))
  }

  if (!dateIso) {
    const m = filename.match(/(\d{2})[-.](\d{2})[-.](\d{4})/)
    if (m) dateIso = `${m[3]}-${m[2]}-${m[1]}`
  }

  if (!isValidIso(dateIso)) {
    return { dates: [], itemsByDate: {} }
  }

  let headerRowIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (
      cell(rows[i], 0).toLowerCase() === 'yemek' &&
      cell(rows[i], 1).toLowerCase() === 'adet'
    ) {
      headerRowIdx = i
      break
    }
  }
  if (headerRowIdx === -1) {
    return { dates: [dateIso], itemsByDate: { [dateIso]: {} } }
  }

  const items = {}
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const name = cell(rows[i], 0)
    const qtyRaw = cell(rows[i], 1)
    if (!name) continue
    const qty = parseInt(qtyRaw, 10)
    if (Number.isNaN(qty)) continue
    items[name] = (items[name] || 0) + qty
  }

  return { dates: [dateIso], itemsByDate: { [dateIso]: items } }
}

function parseKitchenOverview(filename, rows) {
  const m = filename.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/)
  if (!m) return { dates: [], itemsByDate: {} }

  const startIso = m[1]
  const endIso = m[2]
  if (!isValidIso(startIso) || !isValidIso(endIso)) {
    return { dates: [], itemsByDate: {} }
  }

  const dates = dateRange(startIso, endIso)
  const itemsByDate = {}
  for (const d of dates) itemsByDate[d] = {}

  const sectionStarts = []
  for (let i = 0; i < rows.length; i++) {
    if (cell(rows[i], 0) === 'Gerechtnaam') {
      let titleIdx = i - 1
      while (titleIdx >= 0 && isRowEmpty(rows[titleIdx])) titleIdx--
      const title = cell(rows[titleIdx], 0).toLowerCase()
      if (title.includes('koksmenu')) continue
      sectionStarts.push(i)
    }
  }

  if (sectionStarts.length === 0) return { dates, itemsByDate }

  const headerRow = rows[sectionStarts[0]]
  const dayToColIdx = {}
  for (let i = 1; i < headerRow.length; i++) {
    const name = cell(headerRow, i)
    if (DUTCH_DAYS.includes(name)) {
      dayToColIdx[name] = i
    }
  }

  for (let s = 0; s < sectionStarts.length; s++) {
    const startIdx = sectionStarts[s] + 1
    let endIdx = rows.length
    for (let i = startIdx; i < rows.length; i++) {
      if (isRowEmpty(rows[i])) {
        endIdx = i
        break
      }
    }

    for (let i = startIdx; i < endIdx; i++) {
      const name = cell(rows[i], 0)
      if (!name) continue
      for (const date of dates) {
        const dutchDay = isoToDutchDay(date)
        const colIdx = dayToColIdx[dutchDay]
        if (colIdx == null) continue
        const qty = parseInt(cell(rows[i], colIdx), 10)
        if (Number.isNaN(qty) || qty === 0) continue
        itemsByDate[date][name] = (itemsByDate[date][name] || 0) + qty
      }
    }
  }

  return { dates, itemsByDate }
}

function parseKitchenListReport(filename, rows) {
  const headerRow = rows[1]
  if (!headerRow) return { dates: [], itemsByDate: {} }

  const colIdxToDate = {}
  for (let i = 1; i < headerRow.length; i++) {
    const value = cell(headerRow, i)
    const m = value.match(/(\d{4}-\d{2}-\d{2})/)
    if (m && isValidIso(m[1])) {
      colIdxToDate[i] = m[1]
    }
  }

  const dates = Array.from(new Set(Object.values(colIdxToDate))).sort()
  const itemsByDate = {}
  for (const d of dates) itemsByDate[d] = {}

  for (let i = 2; i < rows.length; i++) {
    const name = cell(rows[i], 0)
    if (!name) continue
    if (name.toLowerCase().startsWith('grand total')) continue

    for (const [colIdxStr, date] of Object.entries(colIdxToDate)) {
      const colIdx = Number(colIdxStr)
      const qty = parseInt(cell(rows[i], colIdx), 10)
      if (Number.isNaN(qty) || qty === 0) continue
      itemsByDate[date][name] = (itemsByDate[date][name] || 0) + qty
    }
  }

  return { dates, itemsByDate }
}

function buildResult(filename, rows) {
  const type = detectType(filename, rows)

  let analysis = { dates: [], itemsByDate: {} }
  if (type === FILE_TYPES.DAILY_COUNTS) {
    analysis = parseDailyCounts(filename, rows)
  } else if (type === FILE_TYPES.KITCHEN_OVERVIEW) {
    analysis = parseKitchenOverview(filename, rows)
  } else if (type === FILE_TYPES.KITCHEN_LIST_REPORT) {
    analysis = parseKitchenListReport(filename, rows)
  }

  const totalItems = Object.values(analysis.itemsByDate).reduce(
    (sum, items) => sum + Object.values(items).reduce((s, q) => s + q, 0),
    0,
  )

  const datesWithData = analysis.dates.filter(
    (d) => Object.keys(analysis.itemsByDate[d] || {}).length > 0,
  )

  return {
    type,
    typeLabel: TYPE_LABELS[type],
    dates: analysis.dates,
    datesWithData,
    itemsByDate: analysis.itemsByDate,
    totalItems,
  }
}

export function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: false,
      complete: (results) => {
        try {
          resolve(buildResult(file.name, results.data))
        } catch (err) {
          reject(err)
        }
      },
      error: (err) => reject(err),
    })
  })
}

export function parseCSVContent(filename, content) {
  const results = Papa.parse(content, {
    header: false,
    skipEmptyLines: false,
  })
  return buildResult(filename, results.data)
}

const TURKISH_DIACRITICS = 'çÇğĞıİöÖşŞüÜ'

function normalizeName(name) {
  return name
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameQuality(name) {
  let score = 0
  for (const ch of name) {
    if (TURKISH_DIACRITICS.includes(ch)) score += 3
  }
  const words = name.split(/\s+/).filter((w) => w.length > 0)
  for (const word of words) {
    const lower = word.toLocaleLowerCase('tr-TR')
    const upper = word.toLocaleUpperCase('tr-TR')
    if (word === upper && word !== lower) {
      score -= 3
    } else if (
      word[0] === word[0].toLocaleUpperCase('tr-TR') &&
      word[0] !== word[0].toLocaleLowerCase('tr-TR')
    ) {
      score += 2
    }
  }
  return score
}

export function aggregateForDates(files, selectedDates) {
  const selected = new Set(selectedDates)
  const groups = {}
  for (const file of files) {
    if (file.type === FILE_TYPES.UNKNOWN) continue
    for (const [date, items] of Object.entries(file.itemsByDate || {})) {
      if (!selected.has(date)) continue
      for (const [name, qty] of Object.entries(items)) {
        const key = normalizeName(name)
        if (!groups[key]) {
          groups[key] = { displayName: name, qty: 0 }
        } else if (nameQuality(name) > nameQuality(groups[key].displayName)) {
          groups[key].displayName = name
        }
        groups[key].qty += qty
      }
    }
  }
  const totals = {}
  for (const { displayName, qty } of Object.values(groups)) {
    totals[displayName] = qty
  }
  return totals
}
