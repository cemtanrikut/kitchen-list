import { useState } from 'react'
import { formatFileSize, formatNumber } from '../utils/format'
import { isoToDisplay, isoToTrDay } from '../utils/dates'
import { FILE_TYPES } from '../utils/parsers'

function FileIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  )
}

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

function ChevronIcon({ open }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
      }}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

const PREVIEW_ITEMS = 6

function FileCard({ file, onRemove }) {
  const [isOpen, setIsOpen] = useState(false)

  const isUnknown = file.type === FILE_TYPES.UNKNOWN
  const datesWithData = file.datesWithData || []

  return (
    <div
      className={`file-card${isOpen ? ' is-open' : ''}${
        isUnknown ? ' is-unknown' : ''
      }`}
    >
      <div className="file-card-row">
        <div className="file-card-icon" aria-hidden="true">
          <FileIcon />
        </div>

        <div className="file-card-info">
          <div className="file-card-name" title={file.name}>
            {file.name}
          </div>
          <div className="file-card-meta">
            <span
              className={`type-badge${isUnknown ? ' type-badge-warn' : ''}`}
            >
              {file.typeLabel}
            </span>
            {!isUnknown && datesWithData.length > 0 && (
              <>
                <span className="file-card-meta-dot" aria-hidden="true">
                  ·
                </span>
                <span>
                  {datesWithData.length === 1
                    ? isoToDisplay(datesWithData[0])
                    : `${datesWithData.length} gün`}
                </span>
                <span className="file-card-meta-dot" aria-hidden="true">
                  ·
                </span>
                <span>{formatNumber(file.totalItems)} adet</span>
              </>
            )}
            <span className="file-card-meta-dot" aria-hidden="true">
              ·
            </span>
            <span>{formatFileSize(file.size)}</span>
          </div>
        </div>

        <div className="file-card-actions">
          {!isUnknown && datesWithData.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIsOpen((v) => !v)}
              aria-expanded={isOpen}
            >
              <span>Önizle</span>
              <ChevronIcon open={isOpen} />
            </button>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={onRemove}
            aria-label={`${file.name} dosyasını kaldır`}
            title="Kaldır"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="file-card-preview">
          {datesWithData.map((date) => {
            const items = { ...(file.itemsByDate[date] || {}) }
            for (const [n, q] of Object.entries(file.koksmenuByDate?.[date] || {})) {
              items[n] = (items[n] || 0) + q
            }
            const entries = Object.entries(items).sort((a, b) => b[1] - a[1])
            const top = entries.slice(0, PREVIEW_ITEMS)
            const remaining = entries.length - top.length
            const totalQty = entries.reduce((s, [, q]) => s + q, 0)

            return (
              <div key={date} className="preview-day">
                <div className="preview-day-header">
                  <span className="preview-day-date">
                    {isoToDisplay(date)}
                  </span>
                  <span className="preview-day-day">{isoToTrDay(date)}</span>
                  <span className="preview-day-meta">
                    {entries.length} yemek · {formatNumber(totalQty)} adet
                  </span>
                </div>
                {entries.length > 0 ? (
                  <ul className="preview-items">
                    {top.map(([name, qty]) => (
                      <li key={name}>
                        <span className="preview-item-name" title={name}>
                          {name}
                        </span>
                        <span className="preview-item-qty">{qty}</span>
                      </li>
                    ))}
                    {remaining > 0 && (
                      <li className="preview-items-more">
                        +{remaining} yemek daha
                      </li>
                    )}
                  </ul>
                ) : (
                  <div className="preview-empty">Bu gün için veri yok</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FileCard
