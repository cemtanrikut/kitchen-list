function EmptyState() {
  return (
    <div className="empty-state">
      <p className="empty-state-title">Henüz dosya yüklenmedi</p>
      <p className="empty-state-text">
        Yukarıdaki alana CSV dosyalarınızı sürükleyerek veya tıklayarak başlayın.
        Birden fazla dosyayı aynı anda yükleyebilirsiniz.
      </p>
    </div>
  )
}

export default EmptyState
