import ExcelJS from 'exceljs'
import { buildGrid } from './layout'

// Matches the chef's "Keukenlijst": a clean white, fully bordered table with
// light blue-grey category header rows and a big day total. Each day block gets
// its own light tint (header strong, dish rows faint) so days are easy to tell
// apart, and the categories are laid out in two sub-columns per day.
const DAY_HEADER_FILL = [
  'FFD9EAD3', // green (the original's day colour)
  'FFCFE2F3', // blue
  'FFFFF2CC', // amber
  'FFF4CCCC', // red
  'FFD9D2E9', // purple
  'FFD0E0E3', // teal
  'FFFCE5CD', // orange
  'FFEAD1DC', // pink
]
const DAY_ROW_FILL = [
  'FFF3F8F1',
  'FFF3F7FC',
  'FFFFFDF3',
  'FFFCF5F5',
  'FFF7F5FB',
  'FFF2F8F9',
  'FFFEF9F3',
  'FFFBF4F7',
]
const CATEGORY_FILL = 'FFE7EAEC'
const BORDER_COLOR = 'FFBFC6CF'

function solid(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

export async function buildKitchenListXLSX(kitchen) {
  const { grid, meta, rows, dates, perDayCols } = buildGrid(kitchen)
  const edge = { style: 'thin', color: { argb: BORDER_COLOR } }
  const allBorders = { top: edge, left: edge, bottom: edge, right: edge }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kitchen List'
  const ws = wb.addWorksheet('Mutfak Listesi', {
    // Hide Excel's default background gridlines — only our cell borders show.
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  })

  grid.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val !== '' && val != null) ws.getCell(r + 1, c + 1).value = val
    })
  })

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= meta[r - 1].length; c++) {
      const role = meta[r - 1][c - 1]
      if (!role) continue
      const day = Math.floor((c - 1) / perDayCols)
      const rowFill = solid(DAY_ROW_FILL[day % DAY_ROW_FILL.length])
      const headerFill = solid(DAY_HEADER_FILL[day % DAY_HEADER_FILL.length])
      const catFill = solid(CATEGORY_FILL)
      const cell = ws.getCell(r, c)
      cell.border = allBorders

      if (role === 'header') {
        cell.fill = headerFill
        cell.font = { bold: true, size: 15 }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (role === 'cat') {
        cell.fill = catFill
        cell.font = { bold: true, size: 12 }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (role === 'catAdet') {
        cell.fill = catFill
        cell.font = { bold: true, size: 11 }
        cell.alignment = { horizontal: 'center' }
      } else if (role === 'dish') {
        cell.fill = rowFill
        cell.font = { size: 12 }
      } else if (role === 'dishQty') {
        cell.fill = rowFill
        cell.font = { bold: true, size: 12 } // bold quantities
        cell.alignment = { horizontal: 'right' }
      } else if (role === 'total') {
        cell.fill = catFill
        cell.font = { bold: true, size: 14 }
        cell.alignment = { vertical: 'middle' }
      } else if (role === 'totalQty') {
        cell.fill = catFill
        cell.font = { bold: true, size: 28 } // big day total
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    }
  }

  dates.forEach((_, di) => {
    const base = di * perDayCols + 1 // 1-based first column of the day
    ws.mergeCells(1, base, 1, base + 4) // day header spans both sub-columns
    ws.getColumn(base).width = 27 // L name
    ws.getColumn(base + 1).width = 7 // L qty
    ws.getColumn(base + 2).width = 2 // mid gap
    ws.getColumn(base + 3).width = 27 // R name
    ws.getColumn(base + 4).width = 7 // R qty
    if (di < dates.length - 1) ws.getColumn(base + 5).width = 2 // day gap

    // Give the day total room to be big: span the number across qty..right edge.
    // Every day's total is on the same shared bottom row.
    const tr = rows
    ws.mergeCells(tr, base + 1, tr, base + 4)
    const totalCell = ws.getCell(tr, base + 1)
    totalCell.fill = solid(CATEGORY_FILL)
    totalCell.font = { bold: true, size: 28 }
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' }
    totalCell.border = allBorders
    ws.getRow(tr).height = 34
  })
  ws.getRow(1).height = 22
  ws.getRow(rows).height = 22

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
