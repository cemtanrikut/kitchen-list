// Persists the chef's-box contents in the browser (Vercel is frontend-only, no
// backend). The file is uploaded once and reused across reloads/weeks until the
// user replaces it. Per-browser/device by nature.
const KEY = 'kitchen-list:koksmenu-contents'

export function loadKoksmenuContents() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (
      !data ||
      (!data.fiveDay?.length && !data.sixDay?.length && !data.sevenDay?.length)
    )
      return null
    return data
  } catch {
    return null
  }
}

export function saveKoksmenuContents(contents) {
  try {
    localStorage.setItem(KEY, JSON.stringify(contents))
  } catch {
    // ignore quota / disabled-storage errors
  }
}

export function clearKoksmenuContents() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
