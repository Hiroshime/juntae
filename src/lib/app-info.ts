import packageMetadata from "../../package.json";

export const appInfo = {
  name: "Juntaê",
  version: packageMetadata.version,
  author: "Luiz Antonio Batista Rossato",
  repositories: {
    github: {
      label: "github.com/Hiroshime/juntae",
      url: "https://github.com/Hiroshime/juntae",
    },
    dockerHub: {
      label: "docker.io/hiroshime/juntae",
      url: "https://hub.docker.com/r/hiroshime/juntae",
    },
  },
} as const;
