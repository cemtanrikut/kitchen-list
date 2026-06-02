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

// Source systems (apicbase) emit sentinel rows wrapped in double underscores —
// e.g. "__NO_MEAL__" for an order line with no meal chosen. These are not dishes
// and must never reach a category or the totals.
const PLACEHOLDER_NAME = /^__.*__$/

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
  if (PLACEHOLDER_NAME.test(raw.trim())) {
    return { koksmenu: false, name: '' }
  }
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

// Chef's-box order counts, read straight from the raw per-order rows at the top of
// the kitchen-overview export (the rows with "Type menu" = CHEF). This is the
// reliable source: the "Totalen koksmenu per leverdag" summary further down has been
// seen to over-count the boxes. Returns { [Bezorgdatum]: { fiveDay, sixDay, sevenDay } }
// where each value is the number of PEOPLE on a CHEF box of that size (5 / 6 / 7 days)
// for that delivery day — Σ "Aantal personen", counted once per distinct "Order id".
// categories.js turns these into dishes: a box dish is served on every day of the
// box, so each dish is needed (people × box-days) times.
function parseKoksmenuOrders(rows, dates) {
  const want = new Set(dates)

  // Locate the per-order header row (Type menu / Bezorgdatum / Aantal maaltijden).
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) continue
    const lower = rows[i].map((c) => (c ?? '').toString().trim().toLowerCase())
    if (
      lower.includes('type menu') &&
      lower.includes('bezorgdatum') &&
      lower.includes('aantal maaltijden')
    ) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return {}

  const header = rows[headerIdx].map((c) => (c ?? '').toString().trim().toLowerCase())
  const idOrder = header.indexOf('order id')
  const idType = header.indexOf('type menu')
  const idDate = header.indexOf('bezorgdatum')
  const idPers = header.indexOf('aantal personen')
  const idMeals = header.indexOf('aantal maaltijden')
  if (idType < 0 || idDate < 0 || idPers < 0 || idMeals < 0) return {}

  const result = {}
  const seen = new Set()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    if (!rows[i]) continue
    if (cell(rows[i], idType).toUpperCase() !== 'CHEF') continue
    const orderId = cell(rows[i], idOrder)
    if (orderId) {
      if (seen.has(orderId)) continue // one CHEF order can span rows — count it once
      seen.add(orderId)
    }
    const date = cell(rows[i], idDate)
    if (!want.has(date)) continue
    const persons = parseInt(cell(rows[i], idPers), 10)
    if (!persons || persons <= 0) continue
    const meals = parseInt(cell(rows[i], idMeals), 10)
    if (!result[date]) result[date] = { fiveDay: 0, sixDay: 0, sevenDay: 0 }
    if (meals === 5) result[date].fiveDay += persons
    else if (meals === 6) result[date].sixDay += persons
    else if (meals === 7) result[date].sevenDay += persons
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
  for (let i = 0; i < rows.length; i++) {
    if (cell(rows[i], 0) === 'Gerechtnaam') {
      let titleIdx = i - 1
      while (titleIdx >= 0 && isRowEmpty(rows[titleIdx])) titleIdx--
      const title = cell(rows[titleIdx], 0).toLowerCase()
      // Skip the "Totalen koksmenu per leverdag" pivot — box counts come from the raw
      // CHEF order rows instead (that summary has been seen to over-count the boxes).
      if (title.includes('koksmenu')) continue
      sectionStarts.push(i)
    }
  }

  const koksmenuPackagesByDate = parseKoksmenuOrders(rows, dates)

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

// Recurring source-data misspellings, keyed by normalized word. Folded into the
// canonical spelling so the same dish never splits into two rows. "Arabaşı" (a
// soup) is frequently typed "Aribaşı".
const WORD_ALIASES = { aribasi: 'arabasi' }

// Whole-name variants that mean the same dish but can't be folded word-by-word
// (here "tavuk" alone must stay distinct from "tavuklu"). Keyed by the fully
// normalized name. "TAVUK TURLU" is the same dish as "Tavuklu Turlu".
const PHRASE_ALIASES = { 'tavuk turl': 'tavuklu turl' }

export function normalizeName(name) {
  const words = name
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    // Drop apostrophes so a suffix attached with one stays part of its word
    // ("Loris'in" -> "lorisin"), matching the un-apostrophed template name.
    .replace(/['’‘´`]/g, '')
    // Treat any other punctuation/separator as a word break so "Biber&Domates"
    // and "Biber & Domates" collapse to the same key.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => WORD_ALIASES[w] || w)

  // Drop a trailing Turkish 3rd-person possessive suffix on the head noun so the
  // package short forms group with the full menu names ("islim kebab" == "islim
  // kebabı", "kayseri yaglamas(i)"). Applied to both sides, so exact matches stay
  // matched; guarded by a min length so short words aren't mangled.
  if (words.length > 0) {
    const last = words.length - 1
    const folded = words[last].replace(/s?[iu]$/, '')
    if (folded.length >= 3) words[last] = folded
  }

  const key = words.join(' ')
  return PHRASE_ALIASES[key] || key
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

