const DUTCH_DAYS = [
  'Zondag',
  'Maandag',
  'Dinsdag',
  'Woensdag',
  'Donderdag',
  'Vrijdag',
  'Zaterdag',
]

const TR_DAYS = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
]

export function isoToDutchDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return DUTCH_DAYS[d.getUTCDay()]
}

export function isoToTrDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return TR_DAYS[d.getUTCDay()]
}

export function isoToDisplay(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

export function ddmmyyyyToIso(value) {
  if (!value || typeof value !== 'string') return null
  const parts = value.trim().split(/[.\-/]/)
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y) return null
  if (y.length !== 4) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export function dateRange(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const dates = []
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

export function isValidIso(iso) {
  if (!iso || typeof iso !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime())
}
