import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Galera — organização da comunidade",
  description: "Disponibilidade, eventos e votações para a sua comunidade.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
