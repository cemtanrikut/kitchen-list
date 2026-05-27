import { useMemo, useState } from 'react'
import Header from './components/Header'
import UploadZone from './components/UploadZone'
import FileCard from './components/FileCard'
import EmptyState from './components/EmptyState'
import AnalysisPanel from './components/AnalysisPanel'
import KoksmenuCard from './components/KoksmenuCard'
import { parseCSVFile, FILE_TYPES } from './utils/parsers'
import { buildKitchenList } from './utils/categories'
import { buildKitchenListCSV, downloadCSV, downloadBlob } from './utils/csv'
import { isXlsx, parseMenuListExport } from './utils/menuListExport'
import {
  loadKoksmenuContents,
  saveKoksmenuContents,
  clearKoksmenuContents,
} from './utils/koksmenuStore'
import './App.css'

function App() {
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedDates, setSelectedDates] = useState([])
  const [isExporting, setIsExporting] = useState(false)
  const [fileName, setFileName] = useState(
    () => `mutfak-listesi-${new Date().toISOString().slice(0, 10)}`,
  )
  const [koksmenu, setKoksmenu] = useState(() => loadKoksmenuContents())

  const availableDates = useMemo(() => {
    const map = new Map()
    for (const file of files) {
      if (file.type === FILE_TYPES.UNKNOWN) continue
      for (const date of file.datesWithData || []) {
        if (!map.has(date)) map.set(date, new Set())
        map.get(date).add(file.id)
      }
    }
    return Array.from(map.entries())
      .map(([date, fileIds]) => ({ date, fileCount: fileIds.size }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [files])

  const kitchen = useMemo(() => {
    if (selectedDates.length === 0) {
      return {
        dates: [],
        categories: [],
        dayTotals: {},
        grandTotal: 0,
        summary: { dishCount: 0, total: 0 },
      }
    }
    return buildKitchenList(files, selectedDates, koksmenu)
  }, [files, selectedDates, koksmenu])

  const handleFilesAdded = async (incoming) => {
    setError(null)
    setIsProcessing(true)

    const accepted = []
    const errors = []
    const unknown = []
    let nextKoksmenu = null

    for (const file of incoming) {
      // Chef's-box contents (.xlsx) — persisted in localStorage, reused across the
      // week. Not added as a transient file card.
      if (isXlsx(file)) {
        try {
          nextKoksmenu = await parseMenuListExport(file)
        } catch (err) {
          errors.push(`"${file.name}" Şefin Kutusu dosyası okunamadı: ${err.message}`)
        }
        continue
      }

      const isCSV =
        file.name.toLowerCase().endsWith('.csv') ||
        file.type === 'text/csv' ||
        file.type === 'application/vnd.ms-excel'

      if (!isCSV) {
        errors.push(`"${file.name}" CSV veya Excel dosyası değil`)
        continue
      }

      try {
        const parsed = await parseCSVFile(file)
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`
        const record = {
          id,
          name: file.name,
          size: file.size,
          ...parsed,
        }
        accepted.push(record)
        if (parsed.type === FILE_TYPES.UNKNOWN) {
          unknown.push(file.name)
        }
      } catch (err) {
        errors.push(`"${file.name}" okunamadı: ${err.message}`)
      }
    }

    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted])
    }

    if (nextKoksmenu) {
      saveKoksmenuContents(nextKoksmenu)
      setKoksmenu(nextKoksmenu)
    }

    const messages = []
    if (errors.length > 0) messages.push(errors.join(' · '))
    if (unknown.length > 0) {
      messages.push(
        `Tanınmayan biçim: ${unknown.join(', ')} — analize dahil edilmeyecek`,
      )
    }
    if (messages.length > 0) setError(messages.join(' · '))

    setIsProcessing(false)
  }

  const handleRemove = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setError(null)
    setIsAnalyzing(false)
    setSelectedDates([])
  }

  const handleClearAll = () => {
    setFiles([])
    setError(null)
    setIsAnalyzing(false)
    setSelectedDates([])
  }

  const handleRemoveKoksmenu = () => {
    clearKoksmenuContents()
    setKoksmenu(null)
  }

  const handleAnalyze = () => {
    setIsAnalyzing(true)
    if (selectedDates.length === 0 && availableDates.length > 0) {
      setSelectedDates(availableDates.map((d) => d.date))
    }
  }

  const handleCloseAnalysis = () => {
    setIsAnalyzing(false)
  }

  const handleToggleDate = (date) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    )
  }

  const handleToggleAll = () => {
    if (selectedDates.length === availableDates.length) {
      setSelectedDates([])
    } else {
      setSelectedDates(availableDates.map((d) => d.date))
    }
  }

  const handleExportCSV = () => {
    if (kitchen.summary.dishCount === 0) return
    setIsExporting(true)
    try {
      const csv = buildKitchenListCSV(kitchen)
      const base = (fileName.trim() || 'mutfak-listesi').replace(/\.(csv|xlsx)$/i, '')
      downloadCSV(csv, `${base}.csv`)
    } catch (err) {
      setError(`Dışa aktarma başarısız: ${err.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportXLSX = async () => {
    if (kitchen.summary.dishCount === 0) return
    setIsExporting(true)
    try {
      // exceljs is heavy; load it only when an Excel export is actually requested.
      const { buildKitchenListXLSX } = await import('./utils/xlsx')
      const blob = await buildKitchenListXLSX(kitchen)
      const base = (fileName.trim() || 'mutfak-listesi').replace(/\.(csv|xlsx)$/i, '')
      downloadBlob(blob, `${base}.xlsx`)
    } catch (err) {
      setError(`Excel dışa aktarma başarısız: ${err.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const hasFiles = files.length > 0
  const analyzableCount = files.filter(
    (f) => f.type !== FILE_TYPES.UNKNOWN,
  ).length
  const canAnalyze = analyzableCount > 0 && availableDates.length > 0
  const needsKoksmenuFile =
    !koksmenu &&
    files.some(
      (f) => Object.keys(f.koksmenuPackagesByDate || {}).length > 0,
    )

  return (
    <div className="app">
      <Header />

      <main className="container">
        <section className="upload-section">
          <UploadZone onFilesAdded={handleFilesAdded} compact={hasFiles} />
          {koksmenu && (
            <KoksmenuCard
              contents={koksmenu}
              onRemove={handleRemoveKoksmenu}
            />
          )}
          {needsKoksmenuFile && (
            <div className="alert alert-info" role="status">
              Koksmenu paketleri bulundu ama Şefin Kutusu içerik dosyası yüklü
              değil. Paketlerin yemeklere dağılması için .xlsx içerik dosyasını
              yükleyin.
            </div>
          )}
          {isProcessing && (
            <div className="status-line">Dosyalar işleniyor…</div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
        </section>

        <section className="files-section">
          <div className="section-header">
            <h2 className="section-title">
              Yüklenen dosyalar
              {hasFiles && <span className="badge">{files.length}</span>}
            </h2>
            {hasFiles && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleClearAll}
              >
                Tümünü temizle
              </button>
            )}
          </div>

          {hasFiles ? (
            <div className="file-list">
              {files.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  onRemove={() => handleRemove(f.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </main>

      {hasFiles && (
        <div className="export-bar">
          <div className="container export-bar-inner">
            {!isAnalyzing ? (
              <>
                <div className="export-summary">
                  <strong>{files.length} dosya</strong>
                  {analyzableCount < files.length && (
                    <>
                      <span className="dot">·</span>
                      <span>{analyzableCount} analiz edilebilir</span>
                    </>
                  )}
                  {canAnalyze && (
                    <>
                      <span className="dot">·</span>
                      <span>
                        {availableDates.length}{' '}
                        {availableDates.length === 1 ? 'tarih' : 'tarih'}{' '}
                        bulundu
                      </span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                >
                  Analiz Et
                </button>
              </>
            ) : (
              <AnalysisPanel
                availableDates={availableDates}
                selectedDates={selectedDates}
                onToggleDate={handleToggleDate}
                onToggleAll={handleToggleAll}
                onClose={handleCloseAnalysis}
                onExportCSV={handleExportCSV}
                onExportXLSX={handleExportXLSX}
                isExporting={isExporting}
                itemCount={kitchen.summary.dishCount}
                totalQty={kitchen.summary.total}
                fileName={fileName}
                onFileNameChange={setFileName}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
