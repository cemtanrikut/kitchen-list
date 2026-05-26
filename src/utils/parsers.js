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

const KOKSMENU_PREFIX = /^\s*koksmenu\s*\/\s*/i

// Title-case a SHOUTING package label: "TAVUK SULTAN" -> "Tavuk Sultan",
// "KOZLENMIS BIBER&DOMATES" -> "Kozlenmis Biber&Domates". Uses en-US casing on
// purpose — these labels are plain ASCII, so we avoid the Turkish I/İ rules that
// would otherwise turn "ISLIM" into "Islım".
function toTitleCase(name) {
  return name
    .toLocaleLowerCase('en-US')
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, sep, ch) =>
      sep + ch.toLocaleUpperCase('en-US'),
    )
}

// Orders placed via the chef's package menu arrive as "KOKSMENU / <dish>". These
// portions are kept in their own bucket (never folded into the à la carte dish of
// the same name) and land in the dedicated "KOKSMENU" category at export time. We
// strip the SHOUTING package label down to a plain Title-Case dish name so the
// "KOKSMENU /" prefix never surfaces. classify() reports whether a raw cell is a
// package item and returns the cleaned dish name either way.
function classify(raw) {
  if (KOKSMENU_PREFIX.test(raw)) {
    return {
      koksmenu: true,
      name: toTitleCase(raw.replace(KOKSMENU_PREFIX, '').trim()),
    }
  }
  return { koksmenu: false, name: raw }
}

function bump(map, date, name, qty) {
  if (!map[date]) map[date] = {}
  map[date][name] = (map[date][name] || 0) + qty
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
    return { dates: [], itemsByDate: {}, koksmenuByDate: {} }
  }

  const itemsByDate = { [dateIso]: {} }
  const koksmenuByDate = { [dateIso]: {} }

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
    return { dates: [dateIso], itemsByDate, koksmenuByDate }
  }

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const { koksmenu, name } = classify(cell(rows[i], 0))
    if (!name) continue
    const qty = parseInt(cell(rows[i], 1), 10)
    if (Number.isNaN(qty) || qty === 0) continue
    bump(koksmenu ? koksmenuByDate : itemsByDate, dateIso, name, qty)
  }

  return { dates: [dateIso], itemsByDate, koksmenuByDate }
}

// The "Totalen koksmenu per leverdag" section lists how many chef's-box packages
// were ordered per delivery day: "Koksmenu 5 dagen" / "Koksmenu 7 dagen". These are
// package counts, not dishes. Return { [date]: { fiveDay, sevenDay } } for the days
// that have any. categories.js explodes them into dishes via the box contents file.
function parseKoksmenuPackages(rows, headerIdx, dates) {
  const result = {}
  if (headerIdx < 0) return result

  const dayToColIdx = {}
  const headerRow = rows[headerIdx]
  for (let i = 1; i < headerRow.length; i++) {
    const name = cell(headerRow, i)
    if (DUTCH_DAYS.includes(name)) dayToColIdx[name] = i
  }

  let endIdx = rows.length
  for (let i = headerIdx + 1; i < rows.length; i++) {
    if (isRowEmpty(rows[i])) {
      endIdx = i
      break
    }
  }

  const findRow = (needle) => {
    for (let i = headerIdx + 1; i < endIdx; i++) {
      if (cell(rows[i], 0).toLowerCase().includes(needle)) return rows[i]
    }
    return null
  }
  const fiveRow = findRow('5 dagen')
  const sevenRow = findRow('7 dagen')
  const readQty = (row, col) => {
    if (!row || col == null) return 0
    const n = parseInt(cell(row, col), 10)
    return Number.isNaN(n) ? 0 : n
  }

  for (const date of dates) {
    const col = dayToColIdx[isoToDutchDay(date)]
    const fiveDay = readQty(fiveRow, col)
    const sevenDay = readQty(sevenRow, col)
    if (fiveDay > 0 || sevenDay > 0) result[date] = { fiveDay, sevenDay }
  }
  return result
}

function parseKitchenOverview(filename, rows) {
  const m = filename.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/)
  if (!m) {
    return { dates: [], itemsByDate: {}, koksmenuByDate: {}, koksmenuPackagesByDate: {} }
  }

  const startIso = m[1]
  const endIso = m[2]
  if (!isValidIso(startIso) || !isValidIso(endIso)) {
    return { dates: [], itemsByDate: {}, koksmenuByDate: {}, koksmenuPackagesByDate: {} }
  }

  const dates = dateRange(startIso, endIso)
  const itemsByDate = {}
  const koksmenuByDate = {}
  for (const d of dates) {
    itemsByDate[d] = {}
    koksmenuByDate[d] = {}
  }

  const sectionStarts = []
  let koksmenuHeaderIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (cell(rows[i], 0) === 'Gerechtnaam') {
      let titleIdx = i - 1
      while (titleIdx >= 0 && isRowEmpty(rows[titleIdx])) titleIdx--
      const title = cell(rows[titleIdx], 0).toLowerCase()
      if (title.includes('koksmenu')) {
        koksmenuHeaderIdx = i
        continue
      }
      sectionStarts.push(i)
    }
  }

  const koksmenuPackagesByDate = parseKoksmenuPackages(rows, koksmenuHeaderIdx, dates)

  if (sectionStarts.length === 0) {
    return { dates, itemsByDate, koksmenuByDate, koksmenuPackagesByDate }
  }

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
      const { koksmenu, name } = classify(cell(rows[i], 0))
      if (!name) continue
      for (const date of dates) {
        const dutchDay = isoToDutchDay(date)
        const colIdx = dayToColIdx[dutchDay]
        if (colIdx == null) continue
        const qty = parseInt(cell(rows[i], colIdx), 10)
        if (Number.isNaN(qty) || qty === 0) continue
        bump(koksmenu ? koksmenuByDate : itemsByDate, date, name, qty)
      }
    }
  }

  return { dates, itemsByDate, koksmenuByDate, koksmenuPackagesByDate }
}

function parseKitchenListReport(filename, rows) {
  const headerRow = rows[1]
  if (!headerRow) return { dates: [], itemsByDate: {}, koksmenuByDate: {} }

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
  const koksmenuByDate = {}
  for (const d of dates) {
    itemsByDate[d] = {}
    koksmenuByDate[d] = {}
  }

  for (let i = 2; i < rows.length; i++) {
    const raw = cell(rows[i], 0)
    if (!raw || raw.toLowerCase().startsWith('grand total')) continue
    const { koksmenu, name } = classify(raw)
    if (!name) continue

    for (const [colIdxStr, date] of Object.entries(colIdxToDate)) {
      const colIdx = Number(colIdxStr)
      const qty = parseInt(cell(rows[i], colIdx), 10)
      if (Number.isNaN(qty) || qty === 0) continue
      bump(koksmenu ? koksmenuByDate : itemsByDate, date, name, qty)
    }
  }

  return { dates, itemsByDate, koksmenuByDate }
}

function buildResult(filename, rows) {
  const type = detectType(filename, rows)

  let analysis = { dates: [], itemsByDate: {}, koksmenuByDate: {} }
  if (type === FILE_TYPES.DAILY_COUNTS) {
    analysis = parseDailyCounts(filename, rows)
  } else if (type === FILE_TYPES.KITCHEN_OVERVIEW) {
    analysis = parseKitchenOverview(filename, rows)
  } else if (type === FILE_TYPES.KITCHEN_LIST_REPORT) {
    analysis = parseKitchenListReport(filename, rows)
  }

  const itemsByDate = analysis.itemsByDate || {}
  const koksmenuByDate = analysis.koksmenuByDate || {}

  const sumMap = (m) =>
    Object.values(m).reduce(
      (sum, items) => sum + Object.values(items).reduce((s, q) => s + q, 0),
      0,
    )
  const totalItems = sumMap(itemsByDate) + sumMap(koksmenuByDate)

  const datesWithData = analysis.dates.filter(
    (d) =>
      Object.keys(itemsByDate[d] || {}).length > 0 ||
      Object.keys(koksmenuByDate[d] || {}).length > 0,
  )

  return {
    type,
    typeLabel: TYPE_LABELS[type],
    dates: analysis.dates,
    datesWithData,
    itemsByDate,
    koksmenuByDate,
    koksmenuPackagesByDate: analysis.koksmenuPackagesByDate || {},
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

export function normalizeName(name) {
  const words = name
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    // Treat any punctuation/separator as a word break so "Biber&Domates" and
    // "Biber & Domates" collapse to the same key.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  // Drop a trailing Turkish 3rd-person possessive suffix on the head noun so the
  // package short forms group with the full menu names ("islim kebab" == "islim
  // kebabı", "kayseri yaglamas(i)"). Applied to both sides, so exact matches stay
  // matched; guarded by a min length so short words aren't mangled.
  if (words.length > 0) {
    const last = words.length - 1
    const folded = words[last].replace(/s?[iu]$/, '')
    if (folded.length >= 3) words[last] = folded
  }

  return words.join(' ')
}

export function nameQuality(name) {
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

