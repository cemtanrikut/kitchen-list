import { normalizeName, nameQuality, FILE_TYPES } from './parsers'

// Fixed kitchen-list template, derived from the chef's manual "Keukenlijst" sheet.
// Each à la carte dish has a home category; the two package sections
// ("KOKSMENU - GARNITUR" + "KOKSMENU - ANA YEMEK") are merged into one KOKSMENU
// category. The order here is the order dishes appear in the export.
export const KOKSMENU_CATEGORY = 'KOKSMENU'
export const OTHER_CATEGORY = 'Diğer'

const TEMPLATE = [
  [
    'SULU YEMEKLER',
    [
      'Etli Güveç',
      'İzmir Köfte',
      'Tas Kebabı',
      'Orman Kebabı',
      'Bamya',
      'Etli Nohut Yemeği',
      'Etli Kuru Fasulye',
      'Sulu Köfte',
    ],
  ],
  ['IZGARA ET', ['Adana Kebab', 'Köfte', 'Patlıcan Kebabı']],
  ['IZGARA TAVUK', ['Fırında Tavuk', 'Tavuk Şiş', 'Tavuk Kanat']],
  [
    'TAVUKLU YEMEKLER',
    ['Tavuk Sultan', 'Tavuklu Mantar Sote', 'Tavuklu Turlu', 'Tavuk Haşlama'],
  ],
  ['ETLI YEMEKLER', ['Biber Dolma', 'Spagetti Bolognese', 'Musakka', 'Karnıyarık']],
  ['Premium paket', ['Kayseri Yağlaması']],
  [
    'GARNITUR',
    [
      'Karnıbahar Kızartması',
      'Penne',
      'Spagetti Naturel',
      'Fırınlanmış Sebzeler',
      'Mercimek Çorbası',
      'Mantar Sote',
      'Fırında Patates',
      'Bulgur Pilavı',
      'Pirinç Pilavı',
      'Sebzeli Tavuk Çorbası',
      'Yayla Çorbası',
      'Ezogelin Çorbası',
    ],
  ],
  [
    KOKSMENU_CATEGORY,
    [
      'Tricolore Makarna',
      'Peynirli Pogaca',
      'Kuskus',
      'Borsch soup',
      'Közlenmiş Biber & Domates',
      'Tarhana Çorbası',
      'Cheddar Soslu Patates',
      'Citir Tavuk',
      'Sebzeli Sulu Kofte',
      'İslim Kebabı',
      'Lorisin Köfte Gezegenleri',
    ],
  ],
  ['BALIK', ['Levrek', 'Somon']],
  [
    'VEGAN',
    [
      'Vegan Dolma',
      'Vegan Karnıyarık',
      'Vegan Taze Fasulye',
      'Vegan Zeytinyağlı Ispanak Yemeği',
    ],
  ],
]

// normalized dish name -> { category, canonical, rank } for matching uploaded data.
const LOOKUP = new Map()
TEMPLATE.forEach(([category, dishes]) => {
  dishes.forEach((canonical, rank) => {
    LOOKUP.set(normalizeName(canonical), { category, canonical, rank })
  })
})

export const CATEGORY_ORDER = TEMPLATE.map(([c]) => c).concat(OTHER_CATEGORY)
const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((c, i) => [c, i]))

function addPortion(catMap, dayTotals, date, category, norm, display, qty, opts) {
  const { canonical = false, rank = Infinity } = opts || {}
  if (!catMap.has(category)) catMap.set(category, new Map())
  const dishes = catMap.get(category)
  let dish = dishes.get(norm)
  if (!dish) {
    dish = { display, canonical, rank, perDate: {}, total: 0 }
    dishes.set(norm, dish)
  } else if (canonical && !dish.canonical) {
    // A template (canonical) name always wins over a free-form one.
    dish.display = display
    dish.canonical = true
    dish.rank = rank
  } else if (!dish.canonical && nameQuality(display) > nameQuality(dish.display)) {
    dish.display = display
  }
  dish.perDate[date] = (dish.perDate[date] || 0) + qty
  dish.total += qty
  dayTotals[date] = (dayTotals[date] || 0) + qty
}

// Build the categorised, per-day kitchen list for the selected dates.
// Returns { dates, categories: [{ name, dishes: [{ display, perDate, total }] }],
//           dayTotals, grandTotal, summary }.
export function buildKitchenList(files, selectedDates, koksmenuContents = null) {
  const selected = [...selectedDates].sort()
  const selectedSet = new Set(selected)
  const catMap = new Map()
  const dayTotals = {}

  // Route a dish by its template category (à la carte placement), merging by name.
  const addByTemplate = (date, name, qty) => {
    const norm = normalizeName(name)
    const match = LOOKUP.get(norm)
    if (match) {
      addPortion(catMap, dayTotals, date, match.category, norm, match.canonical, qty, {
        canonical: true,
        rank: match.rank,
      })
    } else {
      addPortion(catMap, dayTotals, date, OTHER_CATEGORY, norm, name, qty)
    }
  }

  for (const file of files) {
    if (file.type === FILE_TYPES.UNKNOWN) continue

    for (const [date, items] of Object.entries(file.itemsByDate || {})) {
      if (!selectedSet.has(date)) continue
      for (const [rawName, qty] of Object.entries(items)) {
        addByTemplate(date, rawName, qty)
      }
    }

    // Package-menu portions always land in the KOKSMENU category, kept separate
    // from any à la carte dish of the same name.
    for (const [date, items] of Object.entries(file.koksmenuByDate || {})) {
      if (!selectedSet.has(date)) continue
      for (const [name, qty] of Object.entries(items)) {
        const norm = normalizeName(name)
        const match = LOOKUP.get(norm)
        const display = match ? match.canonical : name
        const rank = match && match.category === KOKSMENU_CATEGORY ? match.rank : Infinity
        addPortion(catMap, dayTotals, date, KOKSMENU_CATEGORY, norm, display, qty, {
          canonical: Boolean(match),
          rank,
        })
      }
    }
  }

  // Explode chef's-box (koksmenu) packages into dishes. Box order counts come from
  // the overview's koksmenuPackagesByDate; the box contents come from the persisted
  // Menu_list_export file. Each dish in a box = (box days) × (boxes ordered that
  // day): 5-day dishes ×5, 7-day dishes ×7. Added to each dish's normal category.
  if (koksmenuContents) {
    const packagesByDate = {}
    for (const file of files) {
      for (const [date, counts] of Object.entries(file.koksmenuPackagesByDate || {})) {
        if (!selectedSet.has(date)) continue
        const acc = packagesByDate[date] || { fiveDay: 0, sevenDay: 0 }
        acc.fiveDay += counts.fiveDay || 0
        acc.sevenDay += counts.sevenDay || 0
        packagesByDate[date] = acc
      }
    }
    for (const [date, counts] of Object.entries(packagesByDate)) {
      const fiveQty = 5 * counts.fiveDay
      const sevenQty = 7 * counts.sevenDay
      if (fiveQty > 0) {
        for (const dish of koksmenuContents.fiveDay || []) addByTemplate(date, dish, fiveQty)
      }
      if (sevenQty > 0) {
        for (const dish of koksmenuContents.sevenDay || []) addByTemplate(date, dish, sevenQty)
      }
    }
  }

  const dates = selected.filter((d) => (dayTotals[d] || 0) > 0)

  const categories = [...catMap.entries()]
    .sort((a, b) => {
      const ra = CATEGORY_RANK.has(a[0]) ? CATEGORY_RANK.get(a[0]) : CATEGORY_ORDER.length
      const rb = CATEGORY_RANK.has(b[0]) ? CATEGORY_RANK.get(b[0]) : CATEGORY_ORDER.length
      return ra - rb
    })
    .map(([name, dishes]) => ({
      name,
      dishes: [...dishes.values()]
        // Drop dishes whose total across the selected days is 0 — they would
        // otherwise show up as an all-blank row.
        .filter((d) => d.total > 0)
        .sort(
          (a, b) =>
            a.rank - b.rank || a.display.localeCompare(b.display, 'tr'),
        )
        .map((d) => ({ display: d.display, perDate: d.perDate, total: d.total })),
    }))
    .filter((c) => c.dishes.length > 0)

  const dishCount = categories.reduce((s, c) => s + c.dishes.length, 0)
  const grandTotal = dates.reduce((s, d) => s + (dayTotals[d] || 0), 0)

  return {
    dates,
    categories,
    dayTotals,
    grandTotal,
    summary: { dishCount, total: grandTotal },
  }
}
