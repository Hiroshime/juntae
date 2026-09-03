import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <div className="container">
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="brand-mark">G</span>
            <span>Galera</span>
          </Link>
          <nav className="nav" aria-label="Navegação principal">
            <Link href="/login">Entrar</Link>
            <Link className="button" href="/register">
              Criar conta
            </Link>
          </nav>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow">Organização sem caos no grupo</div>
            <h1>Quando a galera está livre?</h1>
            <p className="lead">
              O Galera conecta disponibilidade, eventos e votações para vocês combinarem o próximo
              encontro em poucos toques.
            </p>
            <div className="actions">
              <Link className="button" href="/register">
                Começar agora
              </Link>
              <Link className="button secondary" href="/login">
                Já tenho uma conta
              </Link>
            </div>
          </div>
          <div className="hero-card" aria-label="Prévia do dashboard">
            <span className="pill">Próxima melhor data</span>
            <h2 style={{ marginTop: 18 }}>Sábado, 19 de setembro</h2>
            <p className="muted">11 de 14 pessoas disponíveis</p>
            <div className="preview-list">
              <div className="preview-row">
                <span>🏃 Corrida no parque</span>
                <strong>6 confirmados</strong>
              </div>
              <div className="preview-row">
                <span>🎲 Game Night</span>
                <strong>8 confirmados</strong>
              </div>
              <div className="preview-row">
                <span>📊 Votações abertas</span>
                <strong>3 ativas</strong>
              </div>
            </div>
          </div>
        </section>

        <footer className="footer">Um hub privado para organizar os momentos que importam.</footer>
      </div>
    </main>
  );
}
