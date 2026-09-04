export type ChangelogEntry = {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  highlights: string[];
};

// A primeira entrada deve sempre corresponder à versão de package.json.
// O teste unitário falha quando uma nova versão é criada sem atualizar este histórico.
export const changelog: ChangelogEntry[] = [
  {
    version: "0.2.0",
    releasedAt: "2026-09-04",
    title: "Folgas, feriados e rateios",
    summary: "Mais recursos para organizar a rotina e acertar as despesas dos encontros.",
    highlights: [
      "Feriados agora aparecem nos calendários da comunidade.",
      "Cada pessoa pode registrar folgas extras, inclusive em escalas 12×36.",
      "Novo rateio com vários compradores e cálculo automático de quem paga quem.",
      "Nova página Sobre com informações do projeto e histórico de versões.",
    ],
  },
  {
    version: "0.1.3",
    releasedAt: "2026-09-03",
    title: "Cadastros e custos mais claros",
    summary: "Pequenas melhorias para evitar erros e facilitar a organização de eventos.",
    highlights: [
      "O cadastro passou a pedir a confirmação da senha.",
      "Eventos com custo mostram o valor estimado por pessoa confirmada.",
    ],
  },
  {
    version: "0.1.2",
    releasedAt: "2026-09-03",
    title: "Entrada somente por convite",
    summary: "A instalação ficou privada para as pessoas escolhidas pela comunidade.",
    highlights: [
      "Novas contas precisam de um convite criado por administrador.",
      "A primeira conta da instalação é protegida por um código secreto.",
      "Qualquer pessoa cadastrada ainda pode criar sua própria comunidade.",
    ],
  },
  {
    version: "0.1.1",
    releasedAt: "2026-09-03",
    title: "Publicação mais confiável",
    summary: "A entrega pelo GitHub e pelo Docker ficou mais estável.",
    highlights: [
      "Builds separados para computadores e servidores Intel/AMD e ARM.",
      "Melhorias no fluxo automático de testes e publicação da imagem Docker.",
    ],
  },
  {
    version: "0.1.0",
    releasedAt: "2026-09-03",
    title: "Primeira versão do Juntaê",
    summary: "A base para organizar comunidades, agendas e encontros em um só lugar.",
    highlights: [
      "Comunidades, membros, perfis e autenticação.",
      "Escalas, calendários e cálculo das melhores datas.",
      "Eventos, confirmações de presença e votações.",
      "Dashboard, sorteios e quatro opções de tema visual.",
    ],
  },
];
