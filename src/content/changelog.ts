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
    version: "0.10.0",
    releasedAt: "2026-09-15",
    title: "Eventos no calendário da comunidade",
    summary:
      "Agora os eventos aparecem diretamente nos dias correspondentes do calendário do grupo.",
    highlights: [
      "Eventos de um ou vários dias aparecem nas datas corretas, respeitando o fuso horário do evento.",
      "As cores mostram rapidamente sua resposta: Vou, Talvez, Não vou ou Sem resposta.",
      "Ao abrir o dia, você pode consultar o evento e alterar sua resposta diretamente.",
    ],
  },
  {
    version: "0.9.0",
    releasedAt: "2026-09-15",
    title: "Parcelas e créditos na conta do evento",
    summary:
      "A organização agora pode registrar pagamentos antecipados e várias parcelas por pessoa.",
    highlights: [
      "Registre vários pagamentos recebidos do mesmo participante, inclusive antes de existir uma dívida.",
      "Valores pagos além da cota ficam como crédito a favor e podem ser reembolsados depois.",
      "O histórico mantém cada lançamento, observação, autor, data e eventual anulação.",
    ],
  },
  {
    version: "0.8.3",
    releasedAt: "2026-09-14",
    title: "Build Docker final corrigido",
    summary: "A imagem final agora gera o Prisma antes de remover as ferramentas de build.",
    highlights: [
      "A geração do Prisma no estágio final não depende mais do npm global removido.",
      "A imagem continua preparada para a correção das vulnerabilidades de segurança do npm.",
    ],
  },
  {
    version: "0.8.2",
    releasedAt: "2026-09-13",
    title: "Build Docker corrigido",
    summary: "A imagem de produção agora conclui o build sem depender do npm global no runtime.",
    highlights: [
      "A geração do Prisma no estágio final usa diretamente o executável instalado no projeto.",
      "A imagem continua sem o npm global e mantém a correção das vulnerabilidades de segurança.",
    ],
  },
  {
    version: "0.8.1",
    releasedAt: "2026-09-13",
    title: "Correções de segurança do container",
    summary:
      "Atualizamos a imagem de produção para reduzir a superfície de vulnerabilidades conhecidas.",
    highlights: [
      "O container final não inclui mais o npm global, que não é necessário para executar o aplicativo.",
      "As migrações continuam sendo executadas pelo Prisma instalado no próprio projeto.",
    ],
  },
  {
    version: "0.8.0",
    releasedAt: "2026-09-13",
    title: "Desafios fitness (Beta)",
    summary: "Crie desafios fitness, registre treinos e acompanhe a evolução da turma.",
    highlights: [
      "Novo espaço Desafios: combine datas, regras e comparação por pontos, tempo ou distância.",
      "Membros podem entrar e sair dos desafios; o combinado fica protegido após a primeira inscrição.",
      "Publique treinos com fotos, acompanhe o feed e compare os resultados no ranking por pontos, tempo ou distância.",
      "Defina limites diários, duração mínima e exigência de foto; cada pessoa pode remover um treino lançado errado.",
      "As fotos podem ser ampliadas, ficam privadas na comunidade e têm metadados como GPS removidos.",
      "Organizadores podem desconsiderar ou restabelecer treinos, sempre explicando o motivo no histórico do desafio.",
      "Após o último dia, consolide o resultado final para preservar nomes, pontuações e posições definitivamente.",
      "Escolha quais modalidades esportivas valem no desafio, crie modalidades próprias e defina os pontos de cada uma.",
      "Defina pontos fixos por treino ou pontos por métricas, como 5 pontos a cada 3 minutos ou 3 pontos a cada quilômetro.",
      "A pontuação por métrica agora é proporcional e pode usar uma casa decimal, sem descartar frações do treino.",
    ],
  },
  {
    version: "0.7.0",
    releasedAt: "2026-09-12",
    title: "Conta e pagamentos do evento",
    summary: "Ficou mais simples controlar os valores de um passeio do começo ao acerto final.",
    highlights: [
      "Controle opcional que soma o custo do evento e os rateios, descontando as compras já pagas.",
      "Veja quem está quitado, quem ainda precisa pagar e quem tem dinheiro a receber.",
      "Organizadores e administradores podem registrar parcelas e reembolsos, com histórico dos acertos.",
      "Feche a conta após quitar os saldos e preserve os valores finais; reabra quando precisar recalcular.",
    ],
  },
  {
    version: "0.6.0",
    releasedAt: "2026-09-08",
    title: "Navegação e calendário mais claros",
    summary: "Pequenos ajustes visuais ajudam a entender a agenda e circular pelo aplicativo.",
    highlights: [
      "O resumo do dia inteiro ganhou mais destaque que os períodos de manhã, tarde e noite.",
      "A página Sobre mantém o menu da conta para quem já está conectado.",
      "Ao abrir Sobre dentro de uma comunidade, é possível voltar diretamente para ela.",
      "Visitantes continuam vendo uma navegação pública simples, agora com acesso direto ao login.",
    ],
  },
  {
    version: "0.5.0",
    releasedAt: "2026-09-08",
    title: "Álbuns nas opções de votação",
    summary: "Agora dá para comparar lugares e passeios usando várias fotos em cada alternativa.",
    highlights: [
      "Cada opção de votação pode receber até seis fotos.",
      "As fotos podem ser ampliadas em tela cheia e navegadas por toque, botões ou teclado.",
      "As fotos ficam privadas e acessíveis somente aos membros da comunidade.",
      "Arquivos inválidos ou grandes demais são bloqueados antes da publicação.",
    ],
  },
  {
    version: "0.4.0",
    releasedAt: "2026-09-08",
    title: "Votações visuais e eventos flexíveis",
    summary: "Ficou mais fácil comparar lugares e participar apenas de alguns dias de uma viagem.",
    highlights: [
      "Opções de votação agora podem ter foto, descrição, página web e local.",
      "O organizador pode decidir se o evento aceita a resposta “Talvez”.",
      "Eventos com vários dias podem permitir que cada pessoa escolha exatamente quando participará.",
      "A lista de participantes mostra os dias escolhidos por cada pessoa.",
    ],
  },
  {
    version: "0.3.0",
    releasedAt: "2026-09-06",
    title: "Escalas com horário de trabalho",
    summary: "O calendário agora entende em quais horas cada pessoa está trabalhando ou livre.",
    highlights: [
      "Escalas podem informar o início e o fim do turno com precisão de minutos.",
      "O tempo fora do expediente passa a contar como livre no período consultado.",
      "Plantões noturnos, como 19h–7h, continuam corretamente no dia seguinte.",
      "O calendário geral compara dia inteiro, manhã, tarde e noite e informa os horários livres de cada pessoa.",
      "Escalas antigas continuam funcionando sem exigir alteração.",
    ],
  },
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
