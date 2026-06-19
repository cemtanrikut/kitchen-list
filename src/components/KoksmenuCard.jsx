import { useState } from 'react'
import { isoToDisplay } from '../utils/dates'

const STALE_DAYS = 7

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

function KoksmenuCard({ contents, onRemove }) {
  const [isOpen, setIsOpen] = useState(false)

  const uploadedDate = (contents.uploadedAt || '').slice(0, 10)
  const days = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(contents.uploadedAt)) / 86400000),
  )
  const stale = days >= STALE_DAYS
  const ago = days === 0 ? 'bugün' : `${days} gün önce`
  const five = contents.fiveDay || []
  const six = contents.sixDay || []
  const seven = contents.sevenDay || []

  return (
    <div className={`koksmenu-card${stale ? ' is-stale' : ''}`}>
      <div className="koksmenu-card-head">
        <div className="koksmenu-card-title">
          <span className="koksmenu-badge">Şefin Kutusu içeriği</span>
          <span className="koksmenu-file" title={contents.fileName}>
            {contents.fileName}
          </span>
        </div>
        <div className="koksmenu-card-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIsOpen((v) => !v)}
            aria-expanded={isOpen}
          >
            <span>Önizle</span>
            <ChevronIcon open={isOpen} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onRemove}
            aria-label="Şefin Kutusu içeriğini kaldır"
            title="Kaldır"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="koksmenu-card-meta">
        5 Günlük: {five.length} · 6 Günlük: {six.length} · 7 Günlük:{' '}
        {seven.length} yemek
      </div>

      {isOpen && (
        <div className="koksmenu-preview">
          <div className="koksmenu-col">
            <div className="koksmenu-col-title">
              5 Günlük <span>({five.length})</span>
            </div>
            <ol className="koksmenu-list">
              {five.map((dish, i) => (
                <li key={`${dish}-${i}`}>{dish}</li>
              ))}
            </ol>
          </div>
          <div className="koksmenu-col">
            <div className="koksmenu-col-title">
              6 Günlük <span>({six.length})</span>
            </div>
            <ol className="koksmenu-list">
              {six.map((dish, i) => (
                <li key={`${dish}-${i}`}>{dish}</li>
              ))}
            </ol>
          </div>
          <div className="koksmenu-col">
            <div className="koksmenu-col-title">
              7 Günlük <span>({seven.length})</span>
            </div>
            <ol className="koksmenu-list">
              {seven.map((dish, i) => (
                <li key={`${dish}-${i}`}>{dish}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <div className={`koksmenu-notice${stale ? ' is-stale' : ''}`}>
        {stale ? (
          <>
            ⚠ Bu içerik {isoToDisplay(uploadedDate)} tarihinde yüklendi ({ago}).
            Yeni hafta başladıysa güncel Şefin Kutusu dosyasıyla değiştirdiğinizden
            emin olun.
          </>
        ) : (
          <>
            {isoToDisplay(uploadedDate)} tarihinde yüklendi ({ago}). Her yeni hafta
            güncel dosyayla değiştirmeyi unutmayın.
          </>
        )}
      </div>
    </div>
  )
}

export default KoksmenuCard
