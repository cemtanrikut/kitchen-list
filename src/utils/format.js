export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

export function formatNumber(n) {
  return new Intl.NumberFormat('tr-TR').format(n)
}
