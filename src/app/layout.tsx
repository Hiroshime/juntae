import type { Metadata } from "next";
import "./globals.css";

const themeBootstrapScript = `try{var t=localStorage.getItem("juntae_theme");if(["juntae","classic","solar","ocean"].includes(t)){document.documentElement.dataset.theme=t}}catch(e){}`;

export const metadata: Metadata = {
  title: {
    default: "Juntaê — combine, decida e viva junto",
    template: "%s | Juntaê",
  },
  description: "Disponibilidade, eventos e decisões para a sua comunidade.",
  applicationName: "Juntaê",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme="juntae" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0b6663" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
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
