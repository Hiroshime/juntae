import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function HomePage() {
  return (
    <main className="shell">
      <div className="container">
        <header className="topbar">
          <Brand />
          <nav className="nav" aria-label="Navegação principal">
            <ThemeSwitcher />
            <Link className="button" href="/login">
              Entrar
            </Link>
          </nav>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow">Organização sem caos no grupo</div>
            <h1>Quando todo mundo pode?</h1>
            <p className="lead">
              O Juntaê conecta disponibilidade, eventos e votações para o seu grupo combinar o
              próximo encontro em poucos toques.
            </p>
            <div className="actions">
              <Link className="button" href="/login">
                Entrar no Juntaê
              </Link>
              <span className="pill">Cadastro somente por convite</span>
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

        <footer className="footer">
          Um hub privado para organizar os momentos que importam. Novas contas entram por convite.
        </footer>
      </div>
    </main>
  );
}
