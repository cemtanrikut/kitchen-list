function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <img
            src="/yasemin-logo.png"
            alt="Yasemin"
            className="header-logo"
            width="120"
            height="40"
          />
          <span className="header-divider" aria-hidden="true" />
          <div className="header-title">
            <h1>Kitchen List</h1>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
