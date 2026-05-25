import { isoToDisplay, isoToTrDay } from '../utils/dates'
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
  onExport,
  isExporting,
  itemCount,
  totalQty,
}) {
  const allSelected =
    availableDates.length > 0 && selectedDates.length === availableDates.length

  const canExport = selectedDates.length > 0 && itemCount > 0

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
        <button
          type="button"
          className="btn btn-primary"
          onClick={onExport}
          disabled={!canExport || isExporting}
        >
          {isExporting ? 'Hazırlanıyor…' : 'Export CSV'}
        </button>
      </div>
    </div>
  )
}

export default AnalysisPanel
