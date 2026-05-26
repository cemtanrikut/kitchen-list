import Papa from 'papaparse'
import { buildGrid } from './layout'

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadCSV(csvString, filename) {
  const BOM = '﻿'
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, filename)
}

// The CSV mirrors the Excel layout: day blocks side by side with a gap column
// between them. Colours are Excel-only; here the structure carries the meaning.
export function buildKitchenListCSV(kitchen) {
  const { grid } = buildGrid(kitchen)
  return Papa.unparse(grid)
}
