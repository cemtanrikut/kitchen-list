import { normalizeName, nameQuality, FILE_TYPES } from './parsers'

// Fixed kitchen-list template, derived from the chef's manual "Keukenlijst" sheet.
// Each à la carte dish has a home category; the order here is the order dishes
// appear in the export. The KOKSMENU category is intentionally left empty here and
// is filled dynamically from the uploaded chef's-box contents (the weekly box file)
// — see boxDishes in buildKitchenList. That way it always reflects the dishes
// actually in this week's box. An à la carte order for a dish that is NOT in the box
// (e.g. a one-off "Borsch soup") falls through to "Diğer" instead of being forced
// under KOKSMENU by a stale hard-coded list.
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
      'Dalyan Köfte',
      'Patlıcan Yemeği',
    ],
  ],
  ['IZGARA ET', ['Adana Kebab', 'Köfte', 'Patlıcan Kebabı']],
  ['IZGARA TAVUK', ['Fırında Tavuk', 'Tavuk Şiş', 'Tavuk Kanat', 'Tavuk But']],
  [
    'TAVUKLU YEMEKLER',
    [
      'Tavuk Sultan',
      'Tavuklu Mantar Sote',
      'Tavuklu Turlu',
      'Tavuk Haşlama',
      'Köri Soslu Tavuk',
      'Barbekü Soslu Tavuk',
    ],
  ],
  [
    'ETLI YEMEKLER',
    ['Biber Dolma', 'Spagetti Bolognese', 'Musakka', 'Karnıyarık', 'Antep Tava'],
  ],
  ['Premium paket', ['Kayseri Yağlaması']],
  [
    'GARNITUR',
    [
      'Karnıbahar Kızartması',
      'Penne',
      'Spagetti Naturel',
      'Spaghetti Aglio e Olio',
      'Fırınlanmış Sebzeler',
      'Mercimek Çorbası',
      'Mantar Sote',
      'Fırında Patates',
      'Bulgur Pilavı',
      'Pirinç Pilavı',
      'Sebzeli Tavuk Çorbası',
      'Yayla Çorbası',
      'Ezogelin Çorbası',
      'Domates Çorbası',
      'Borsch soup',
    ],
  ],
  // Dynamic: members come from the uploaded box contents (boxDishes), not a fixed
  // list. Kept here only to hold its place in the category order.
  [KOKSMENU_CATEGORY, []],
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

  // Dishes that appear in the chef's-box contents file, keyed by normalized name
  // (value = the box's own spelling). Per the customer's request, any dish that
  // would otherwise fall into "Diğer" but exists in the box is listed under
  // KOKSMENU instead. Dishes that match an à la carte template keep their normal
  // home — only the would-be-"Diğer" ones are rerouted.
  const boxDishes = new Map()
  if (koksmenuContents) {
    for (const list of [
      koksmenuContents.fiveDay,
      koksmenuContents.sixDay,
      koksmenuContents.sevenDay,
    ]) {
      for (const dish of list || []) {
        const norm = normalizeName(dish)
        if (!boxDishes.has(norm)) boxDishes.set(norm, dish)
      }
    }
  }

  // Route a dish by its template category (à la carte placement), merging by name.
  const addByTemplate = (date, name, qty) => {
    const norm = normalizeName(name)
    const match = LOOKUP.get(norm)
    if (match) {
      addPortion(catMap, dayTotals, date, match.category, norm, match.canonical, qty, {
        canonical: true,
        rank: match.rank,
      })
    } else if (boxDishes.has(norm)) {
      // Box dish with no à la carte home — show it under KOKSMENU with the box's
      // spelling, which (being canonical) also wins over any misspelled variant.
      addPortion(catMap, dayTotals, date, KOKSMENU_CATEGORY, norm, boxDishes.get(norm), qty, {
        canonical: true,
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

  // Explode chef's-box (koksmenu) packages into dishes. koksmenuPackagesByDate holds,
  // per delivery day, the number of PEOPLE on a CHEF box of each size (counted from
  // the raw orders); the box contents (which dishes) come from the persisted
  // Menu_list_export file. Each box dish is made once per person on the box — the box
  // size (5 / 6 / 7) is just the box type, NOT a per-dish multiplier. Added to each
  // dish's normal category, on the delivery day. À la carte orders of the same dish
  // are counted separately (above) and stack on top.
  if (koksmenuContents) {
    const packagesByDate = {}
    for (const file of files) {
      for (const [date, counts] of Object.entries(file.koksmenuPackagesByDate || {})) {
        if (!selectedSet.has(date)) continue
        const acc = packagesByDate[date] || { fiveDay: 0, sixDay: 0, sevenDay: 0 }
        acc.fiveDay += counts.fiveDay || 0
        acc.sixDay += counts.sixDay || 0
        acc.sevenDay += counts.sevenDay || 0
        packagesByDate[date] = acc
      }
    }
    for (const [date, counts] of Object.entries(packagesByDate)) {
      if (counts.fiveDay > 0) {
        for (const dish of koksmenuContents.fiveDay || []) addByTemplate(date, dish, counts.fiveDay)
      }
      if (counts.sixDay > 0) {
        for (const dish of koksmenuContents.sixDay || []) addByTemplate(date, dish, counts.sixDay)
      }
      if (counts.sevenDay > 0) {
        for (const dish of koksmenuContents.sevenDay || []) addByTemplate(date, dish, counts.sevenDay)
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

// Collapse a multi-day kitchen list into a single synthetic day. Every dish's
// quantity becomes its total across all selected days, and the chosen date is
// the only column. Used by the "single day" export, where the user wants the
// whole selection summed up as if everything were cooked on one day. The result
// has the same shape as buildKitchenList, so it flows through the same
// CSV/Excel layout untouched.
export function mergeKitchenToSingleDay(kitchen, dateIso) {
  const categories = kitchen.categories
    .map((cat) => ({
      name: cat.name,
      dishes: cat.dishes
        .filter((d) => d.total > 0)
        .map((d) => ({
          display: d.display,
          perDate: { [dateIso]: d.total },
          total: d.total,
        })),
    }))
    .filter((c) => c.dishes.length > 0)

  return {
    dates: [dateIso],
    categories,
    dayTotals: { [dateIso]: kitchen.grandTotal },
    grandTotal: kitchen.grandTotal,
    summary: kitchen.summary,
  }
}
