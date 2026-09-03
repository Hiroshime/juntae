import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Juntaê",
    short_name: "Juntaê",
    description: "Disponibilidade, eventos e decisões para a sua comunidade.",
    start_url: "/",
    display: "standalone",
    background_color: "#edf4f1",
    theme_color: "#0b6663",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
