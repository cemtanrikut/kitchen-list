import { useEffect, useState } from 'react'
import {
  isoToDisplay,
  isoToTrDay,
  isoToDdmmyyyy,
  ddmmyyyyToIso,
} from '../utils/dates'
import { formatNumber } from '../utils/format'

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function AnalysisPanel({
  availableDates,
  selectedDates,
  onToggleDate,
  onToggleAll,
  onClose,
  onExportCSV,
  onExportXLSX,
  onExportMergedXLSX,
  isExporting,
  itemCount,
  totalQty,
  fileName,
  onFileNameChange,
  mergeDate,
  onMergeDateChange,
}) {
  const allSelected =
    availableDates.length > 0 && selectedDates.length === availableDates.length

  const canExport = selectedDates.length > 0 && itemCount > 0

  // The date field is edited as gg/aa/yyyy text but stored as ISO upstream.
  const [mergeText, setMergeText] = useState(() => isoToDdmmyyyy(mergeDate))

  useEffect(() => {
    setMergeText(isoToDdmmyyyy(mergeDate))
  }, [mergeDate])

  const handleMergeTextChange = (e) => {
    const raw = e.target.value
    setMergeText(raw)
    const iso = ddmmyyyyToIso(raw)
    if (iso) onMergeDateChange(iso)
  }

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <h3 className="analysis-title">Bulunan tarihler</h3>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          aria-label="Analizi kapat"
          title="Kapat"
        >
          <CloseIcon />
        </button>
      </div>

      <label className="analysis-row analysis-row-master">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          aria-label="Tümünü seç"
        />
        <span className="analysis-row-label">Tümünü seç</span>
        <span className="analysis-row-count">
          {availableDates.length}{' '}
          {availableDates.length === 1 ? 'tarih' : 'tarih'}
        </span>
      </label>

      <div className="analysis-list">
        {availableDates.map(({ date, fileCount }) => {
          const checked = selectedDates.includes(date)
          return (
            <label key={date} className="analysis-row">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleDate(date)}
              />
              <span className="analysis-row-label">
                <span className="analysis-date">{isoToDisplay(date)}</span>
                <span className="analysis-day">{isoToTrDay(date)}</span>
              </span>
              <span className="analysis-row-count">
                {fileCount} {fileCount === 1 ? 'dosya' : 'dosya'}
              </span>
            </label>
          )
        })}
      </div>

      <div className="analysis-footer">
        <div className="analysis-summary">
          {selectedDates.length === 0 ? (
            <span>En az bir tarih seçin</span>
          ) : (
            <>
              <strong>
                {selectedDates.length} gün seçili
              </strong>
              <span className="dot">·</span>
              <span>{formatNumber(itemCount)} farklı yemek</span>
              <span className="dot">·</span>
              <span>{formatNumber(totalQty)} adet</span>
            </>
          )}
        </div>
        <div className="analysis-actions">
          <input
            type="text"
            className="filename-input"
            value={fileName}
            onChange={(e) => onFileNameChange(e.target.value)}
            placeholder="dosya adı"
            aria-label="Dosya adı"
            title="Uzantı (.csv / .xlsx) otomatik eklenir"
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onExportCSV}
            disabled={!canExport || isExporting}
          >
            {isExporting ? 'Hazırlanıyor…' : 'CSV indir'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onExportXLSX}
            disabled={!canExport || isExporting}
          >
            {isExporting ? 'Hazırlanıyor…' : 'Excel indir'}
          </button>
          <span className="merge-group">
            <input
              type="text"
              className="merge-date"
              value={mergeText}
              onChange={handleMergeTextChange}
              placeholder="gg/aa/yyyy"
              inputMode="numeric"
              aria-label="Tek gün tarihi (gg/aa/yyyy)"
              title="Tüm seçili günlerin toplamı bu tarih altında tek gün olarak indirilir"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onExportMergedXLSX}
              disabled={!canExport || isExporting}
              title="Seçili günlerin tümünü, seçtiğiniz tarih altında tek bir gün olarak toplar"
            >
              {isExporting ? 'Hazırlanıyor…' : 'Tek gün Excel'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

export default AnalysisPanel
