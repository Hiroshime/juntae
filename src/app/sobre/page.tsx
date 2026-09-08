import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { changelog } from "@/content/changelog";
import { appInfo } from "@/lib/app-info";
import { getSessionUser } from "@/lib/auth/session";
import { listUserCommunities } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sobre",
  description: "Conheça o Juntaê, seus repositórios e as novidades de cada versão.",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatReleaseDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00.000Z`));
}

export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const requestedCommunity = (await searchParams).community;
  const communitySlug = typeof requestedCommunity === "string" ? requestedCommunity : undefined;
  const memberships = user && communitySlug ? await listUserCommunities(user.id) : [];
  const membership = memberships.find(({ community }) => community.slug === communitySlug);
  const authenticatedReturnHref = membership ? `/app/${membership.community.slug}` : "/app";

  return (
    <main className="shell">
      <div className="container">
        {user ? (
          <AppHeader user={user} community={membership?.community} role={membership?.role} />
        ) : (
          <header className="topbar">
            <Brand />
            <nav className="nav" aria-label="Navegação da página Sobre">
              <ThemeSwitcher />
              <Link href="/">Início</Link>
              <Link className="button" href="/login">
                Entrar
              </Link>
            </nav>
          </header>
        )}

        <section className="page about-page">
          <header className="about-hero">
            <div>
              <div className="eyebrow">Sobre o sistema</div>
              <h1>Feito para juntar pessoas, não complicar encontros.</h1>
              <p className="lead">
                O Juntaê ajuda comunidades privadas a encontrar datas, organizar eventos, decidir em
                grupo e dividir despesas — tudo de um jeito simples para usar pelo celular.
              </p>
            </div>
            <div className="about-version" aria-label={`Versão atual ${appInfo.version}`}>
              <span>Versão atual</span>
              <strong>v{appInfo.version}</strong>
              <small>Histórico mantido a cada atualização</small>
            </div>
          </header>

          <section aria-labelledby="project-details-title">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Transparência</div>
                <h2 id="project-details-title">Informações do projeto</h2>
              </div>
            </div>
            <div className="about-info-grid">
              <article className="card about-info-card">
                <span className="about-info-icon" aria-hidden="true">
                  ●
                </span>
                <div>
                  <span>Autor</span>
                  <strong>{appInfo.author}</strong>
                  <p>Idealização e desenvolvimento do Juntaê.</p>
                </div>
              </article>
              <article className="card about-info-card">
                <span className="about-info-icon" aria-hidden="true">
                  &lt;/&gt;
                </span>
                <div>
                  <span>Código-fonte</span>
                  <strong>GitHub</strong>
                  <a
                    className="about-external-link"
                    href={appInfo.repositories.github.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {appInfo.repositories.github.label}
                    <span aria-hidden="true"> ↗</span>
                    <span className="sr-only"> (abre em uma nova aba)</span>
                  </a>
                </div>
              </article>
              <article className="card about-info-card">
                <span className="about-info-icon" aria-hidden="true">
                  ◫
                </span>
                <div>
                  <span>Imagem para instalação</span>
                  <strong>Docker Hub</strong>
                  <a
                    className="about-external-link"
                    href={appInfo.repositories.dockerHub.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {appInfo.repositories.dockerHub.label}
                    <span aria-hidden="true"> ↗</span>
                    <span className="sr-only"> (abre em uma nova aba)</span>
                  </a>
                </div>
              </article>
            </div>
          </section>

          <section className="about-purpose card" aria-labelledby="about-purpose-title">
            <div>
              <div className="eyebrow">Como pensamos</div>
              <h2 id="about-purpose-title">Privado por padrão e pronto para hospedar em casa</h2>
            </div>
            <div className="about-purpose-points">
              <p>
                <strong>Comunidade protegida</strong>
                Novas contas entram por convite e os dados internos exigem autenticação.
              </p>
              <p>
                <strong>Controle da instalação</strong>O projeto pode rodar em servidor próprio com
                Docker e PostgreSQL.
              </p>
              <p>
                <strong>Evolução compreensível</strong>
                As mudanças de cada versão são explicadas abaixo sem termos técnicos desnecessários.
              </p>
            </div>
          </section>

          <section className="about-changelog" aria-labelledby="changelog-title">
            <div className="section-heading about-changelog-heading">
              <div>
                <div className="eyebrow">O que mudou</div>
                <h2 id="changelog-title">Histórico de versões</h2>
                <p className="muted">As novidades mais recentes aparecem primeiro.</p>
              </div>
              <span className="pill">Atualizado na v{appInfo.version}</span>
            </div>
            <ol className="changelog-list">
              {changelog.map((release, index) => (
                <li className="card changelog-entry" key={release.version}>
                  <div className="changelog-version-column">
                    <strong>v{release.version}</strong>
                    {index === 0 && <span className="status-dot active">Atual</span>}
                    <time dateTime={release.releasedAt}>
                      {formatReleaseDate(release.releasedAt)}
                    </time>
                  </div>
                  <div>
                    <h3>{release.title}</h3>
                    <p className="muted">{release.summary}</p>
                    <ul className="changelog-highlights">
                      {release.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </section>

        <footer className="footer about-footer">
          <span>Juntaê · desenvolvido por {appInfo.author}</span>
          {user ? (
            <Link href={authenticatedReturnHref}>
              {membership ? "Voltar à comunidade" : "Voltar às comunidades"}
            </Link>
          ) : (
            <Link href="/">Voltar ao início</Link>
          )}
        </footer>
      </div>
    </main>
  );
}
