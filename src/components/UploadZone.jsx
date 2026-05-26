import { useRef, useState } from 'react'

function UploadIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function UploadZone({ onFilesAdded, compact = false }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return
    onFilesAdded(Array.from(fileList))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (e) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      className={`upload-zone${isDragging ? ' is-dragging' : ''}${compact ? ' is-compact' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="CSV veya Excel dosyalarını yükle"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      <div className="upload-zone-icon" aria-hidden="true">
        <UploadIcon />
      </div>

      <div className="upload-zone-text">
        <p className="upload-zone-title">
          {compact
            ? 'Daha fazla dosya ekle'
            : 'CSV veya Excel dosyalarını buraya sürükleyin'}
        </p>
        {!compact && (
          <p className="upload-zone-hint">
            veya <span className="upload-zone-link">tıklayarak seçin</span>
          </p>
        )}
      </div>

      {!compact && (
        <p className="upload-zone-meta">
          Sipariş CSV'leri · Şefin Kutusu içeriği için .xlsx
        </p>
      )}
    </div>
  )
}

export default UploadZone
