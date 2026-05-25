import Papa from 'papaparse'
import { isoToDisplay } from './dates'

export function downloadCSV(csvString, filename) {
  const BOM = '﻿'
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function buildTotalsCSV(totals, selectedDates = []) {
  const dateLabel = [...selectedDates]
    .sort()
    .map(isoToDisplay)
    .join(', ')

  const rows = Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b, 'tr'))
    .map(([name, qty]) => [name, qty])

  const headerCsv = Papa.unparse([['Tarih', dateLabel]])
  const bodyCsv = Papa.unparse([['Yemek', 'Adet'], ...rows])

  return `${headerCsv}\n\n${bodyCsv}`
}
