"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function AppHeader({
  user,
  community,
  role,
}: {
  user: { name: string; avatarUrl?: string | null };
  community?: { slug: string; name: string };
  role?: "OWNER" | "ADMIN" | "MEMBER";
}) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const aboutHref = community ? `/sobre?community=${encodeURIComponent(community.slug)}` : "/sobre";
  const isCurrent = (href: string, includeChildren = false) =>
    pathname === href || (includeChildren && pathname.startsWith(`${href}/`));

  const communityLinks = community
    ? [
        { href: `/app/${community.slug}`, label: "Início", icon: "⌂", children: false },
        {
          href: `/app/${community.slug}/social`,
          label: "Comunicação",
          icon: "●",
          children: true,
        },
        {
          href: `/app/${community.slug}/agenda/me`,
          label: "Minha agenda",
          icon: "✓",
          children: false,
        },
        {
          href: `/app/${community.slug}/agenda`,
          label: "Calendário",
          icon: "▦",
          children: false,
        },
        {
          href: `/app/${community.slug}/agenda/schedules`,
          label: "Escalas",
          icon: "↻",
          children: false,
        },
        {
          href: `/app/${community.slug}/events`,
          label: "Eventos",
          icon: "◆",
          children: true,
        },
        {
          href: `/app/${community.slug}/polls`,
          label: "Votações",
          icon: "▥",
          children: true,
        },
        {
          href: `/app/${community.slug}/randomizers`,
          label: "Sorteios",
          icon: "🎲",
          children: true,
        },
        {
          href: `/app/${community.slug}/cost-shares`,
          label: "Rateios",
          icon: "÷",
          children: true,
        },
        {
          href: `/app/${community.slug}/members`,
          label: "Membros",
          icon: "●",
          children: false,
        },
        {
          href: `/app/${community.slug}/challenges`,
          label: "Desafios (Beta)",
          icon: "🏆",
          children: true,
        },
        {
          href: `/app/${community.slug}/games`,
          label: "Jogos",
          icon: "🎮",
          children: true,
        },
      ]
    : [];

  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Falha ao sair.");
      window.location.assign("/");
    } catch {
      setLoggingOut(false);
      setLogoutError("Não foi possível sair. Tente novamente.");
    }
  }

  return (
    <>
      <header className="topbar app-topbar">
        <Link className="brand" href={community ? `/app/${community.slug}` : "/app"}>
          <span className="brand-mark" aria-hidden="true">
            Jê
          </span>
          <span>{community?.name ?? "Juntaê"}</span>
        </Link>
        <nav className="nav app-nav" aria-label="Navegação da conta">
          <ThemeSwitcher />
          <Link
            aria-current={isCurrent("/sobre") ? "page" : undefined}
            className={`about-link${community ? " community-about-link" : ""}`}
            href={aboutHref}
          >
            Sobre
          </Link>
          {community && role !== "MEMBER" && (
            <Link
              aria-current={isCurrent(`/app/${community.slug}/settings`) ? "page" : undefined}
              href={`/app/${community.slug}/settings`}
            >
              Configurações
            </Link>
          )}
          <Link className="profile-link" href="/settings/profile">
            <Avatar name={user.name} url={user.avatarUrl} size="small" />
            <span>{user.name}</span>
          </Link>
          <button className="button ghost" disabled={loggingOut} onClick={logout} type="button">
            {loggingOut ? "Saindo…" : "Sair"}
          </button>
        </nav>
      </header>
      {community && (
        <>
          <nav className="section-nav" aria-label="Navegação da comunidade">
            {communityLinks.map((item) => (
              <Link
                aria-current={isCurrent(item.href, item.children) ? "page" : undefined}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <nav className="mobile-community-nav" aria-label="Navegação principal da comunidade">
            {communityLinks
              .filter((item) =>
                ["Início", "Minha agenda", "Eventos", "Votações"].includes(item.label),
              )
              .map((item) => (
                <Link
                  aria-current={isCurrent(item.href, item.children) ? "page" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label === "Minha agenda" ? "Agenda" : item.label}
                </Link>
              ))}
            <details className="mobile-more-menu">
              <summary>
                <span aria-hidden="true">•••</span>
                Mais
              </summary>
              <div>
                <Link href={`/app/${community.slug}/agenda`}>Calendário da comunidade</Link>
                <Link href={`/app/${community.slug}/agenda/schedules`}>Escalas</Link>
                <Link href={`/app/${community.slug}/randomizers`}>Sorteios e geradores</Link>
                <Link href={`/app/${community.slug}/cost-shares`}>Rateios e despesas</Link>
                <Link href={`/app/${community.slug}/challenges`}>Desafios (Beta)</Link>
                <Link href={`/app/${community.slug}/games`}>Jogos</Link>
                <Link href={`/app/${community.slug}/social`}>Comunicação</Link>
                <Link href={`/app/${community.slug}/members`}>Membros</Link>
                {role !== "MEMBER" && (
                  <Link href={`/app/${community.slug}/settings`}>Configurações</Link>
                )}
                <Link href="/settings/profile">Meu perfil</Link>
                <Link aria-current={isCurrent("/sobre") ? "page" : undefined} href={aboutHref}>
                  Sobre o Juntaê
                </Link>
                <button disabled={loggingOut} onClick={logout} type="button">
                  {loggingOut ? "Saindo…" : "Sair"}
                </button>
              </div>
            </details>
          </nav>
        </>
      )}
      {logoutError && (
        <div className="error app-header-error" role="alert">
          {logoutError}
        </div>
      )}
    </>
  );
}
