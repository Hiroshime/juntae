# Juntaê

Juntaê é um hub privado para comunidades de amigos. A primeira versão conecta disponibilidade, escalas, eventos e votações para responder rapidamente: **quando estamos livres e o que podemos fazer juntos?** Os módulos pós-MVP adicionam sorteios reutilizáveis e rateios de despesas com vários compradores.

O MVP descrito no `PRODUCT_SPEC.md` está implementado. Já é possível configurar escalas, comparar o calendário consolidado, organizar eventos, decidir opções ou datas em grupo e compartilhar links privados. Novas contas entram somente por convite de uma comunidade; qualquer usuário cadastrado pode criar novas comunidades.

A página pública `/sobre` apresenta autoria, versão instalada, repositórios oficiais e um histórico
das mudanças escrito para usuários finais. Ao preparar uma versão, atualize `package.json` e adicione
a nova entrada no início de `src/content/changelog.ts`; o teste unitário impede que os dois fiquem
fora de sincronia.

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior
- Docker 24+ com Docker Compose

## Desenvolvimento local

Na raiz do projeto, execute exatamente:

```bash
cp .env.example .env
npm install
npm run setup:local
npm run dev
```

`setup:local` aguarda o health check do PostgreSQL e só então executa geração do Prisma, migrations e seed. As etapas são encadeadas e o processo para imediatamente se alguma delas falhar.

Nas execuções seguintes, use um único comando:

```bash
npm run dev:local
```

Abra [http://localhost:3000](http://localhost:3000).

O seed cria a comunidade `Juntaê`, oito usuários, escalas de demonstração, overrides, eventos, votações e um sorteio salvo com datas calculadas em relação ao dia da execução. Para entrar com um usuário de demonstração, use qualquer e-mail `@juntae.local` criado no seed (por exemplo, `ana@juntae.local`) e a senha `demo1234`. Ao ser executado sobre uma instalação anterior, o seed migra os registros de demonstração `@galera.local` e o slug `galera` sem trocar seus IDs.

Em um banco vazio, abra `/register` e informe o `REGISTRATION_BOOTSTRAP_TOKEN` para criar a primeira
conta. O código inicial deixa de funcionar assim que existir um usuário. Depois, crie uma comunidade
e use **Configurações → Gerar link de convite**; somente owners e administradores podem convidar.

Para encerrar o banco local:

```bash
docker compose down
```

Os dados persistem no volume Docker legado `galera-postgres-data`, cujo nome foi mantido para não abandonar bancos locais criados antes do rebranding. Para removê-los conscientemente e recriar o banco:

```bash
docker compose down -v
```

## Publicação no Docker Hub e instalação no ZimaOS

O arquivo `docker-compose.yml` continua exclusivo para desenvolvimento local. A implantação usa o
`Dockerfile` multi-stage e o `docker-compose.production.yml`: a aplicação inicia como usuário sem
privilégios, aguarda o PostgreSQL saudável, aplica migrations com `prisma migrate deploy` e só então
inicia o Next.js. O seed nunca é executado automaticamente em produção.

### 1. Publicar a imagem

Autentique-se e crie um builder multi-arquitetura uma única vez:

```bash
docker login
docker buildx create --name juntae-builder --use
docker buildx inspect --bootstrap
```

Substitua `SEU_USUARIO` e publique uma versão imutável junto com a tag conveniente `latest`:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag docker.io/SEU_USUARIO/juntae:0.5.0 \
  --tag docker.io/SEU_USUARIO/juntae:latest \
  --push .
```

Se o repositório no Docker Hub for privado, o Docker do ZimaOS também precisará estar autenticado.
Para uma instalação doméstica simples, um repositório público evita essa etapa.

Como alternativa, o workflow `Publicar imagem Docker` distribui o build entre runners `amd64` e
`arm64` nativos do GitHub e publica uma única imagem multi-arquitetura no Docker Hub. No
repositório GitHub, configure em **Settings → Secrets and variables → Actions**:

- variável `DOCKERHUB_USERNAME` com seu usuário;
- secret `DOCKERHUB_TOKEN` com um access token do Docker Hub — nunca use ou salve a senha da conta.

Depois abra **Actions → Publicar imagem Docker → Run workflow**, informe `0.5.0` e execute. O workflow
publicará `SEU_USUARIO/juntae:0.5.0` e `SEU_USUARIO/juntae:latest`. Fazer push de uma tag Git como
`v0.5.0` também publica automaticamente as tags `0.5.0` e `latest`.

### 2. Preparar as variáveis do ZimaOS

```bash
cp .env.zima.example .env.zima
openssl rand -hex 32
openssl rand -base64 48
openssl rand -hex 32
```

Edite `.env.zima`:

- `JUNTAE_IMAGE`: imagem e versão publicadas no Docker Hub;
- `POSTGRES_PASSWORD`: primeiro valor gerado, em hexadecimal para ser seguro dentro da URL;
- `AUTH_SECRET`: segundo valor gerado;
- `REGISTRATION_BOOTSTRAP_TOKEN`: terceiro valor, usado somente para criar a primeira conta de um banco vazio;
- `APP_URL`: URL exata usada no navegador, como `http://192.168.1.50:3080` ou um domínio HTTPS;
- `JUNTAE_DATA_PATH`: diretório persistente do ZimaOS, por padrão `/DATA/AppData/juntae`.

O PostgreSQL não publica nenhuma porta no host. A aplicação acessa o banco internamente pelo nome
`postgres`, nunca por `localhost`.

### 3. Importar no ZimaOS

Gere um Compose já preenchido. O arquivo resultante contém segredos e não deve ser commitado nem
compartilhado:

```bash
docker compose \
  --env-file .env.zima \
  --file docker-compose.production.yml \
  config > juntae-zima.yml
```

No ZimaOS, abra **App Center → Install a Customized App → Import → Docker Compose**, cole o conteúdo
de `juntae-zima.yml`, revise a porta `3080` e instale. Quando os containers `postgres` e `app`
estiverem saudáveis, acesse a URL definida em `APP_URL`.

Na primeira instalação, abra `<APP_URL>/register`, crie a conta inicial com o código de bootstrap e
então crie a primeira comunidade. O código não autoriza nenhuma outra conta após esse cadastro.

Depois da importação, remova `juntae-zima.yml` da máquina local porque seus segredos ficaram
materializados nele. Preserve `.env.zima` em um gerenciador de senhas ou backup protegido.

### Atualizações e backup

Para atualizar, publique uma nova versão imutável, como `0.5.0`, altere `JUNTAE_IMAGE`, gere novamente
o Compose e atualize/reimporte o aplicativo no ZimaOS. O container aplicará apenas as migrations ainda
pendentes. Evite depender somente de `latest`, pois uma tag versionada permite rollback previsível.

O diretório `${JUNTAE_DATA_PATH}/postgres` mantém o banco entre recriações dos containers. Além do
backup desse diretório pelo ZimaOS, mantenha dumps periódicos do PostgreSQL; copiar os arquivos do
banco enquanto ele está escrevendo não substitui um dump consistente.

## Comandos

```bash
npm run dev              # servidor de desenvolvimento
npm run dev:local        # aguarda o PostgreSQL, aplica migrations e inicia o servidor
npm run setup:local      # prepara banco, Prisma, migrations e seed com espera de saúde
npm run build            # build de produção
npm run start            # inicia o build de produção
npm run lint             # ESLint
npm run format:check     # verifica formatação
npm run format           # aplica Prettier
npm run typecheck        # TypeScript strict
npm test                 # todos os testes Vitest
npm run test:unit        # regras de domínio
npm run test:integration # suíte de integração
npm run test:e2e         # Playwright isolado na porta 3100; requer o banco disponível
npm run db:migrate       # aplica migrations pendentes
npm run db:migrate:dev   # cria/aplica migration durante desenvolvimento
npm run db:seed          # carrega dados de demonstração
npm run db:reset         # apaga e recria o banco local
```

## Variáveis de ambiente

Copie `.env.example` para `.env`. Não comite `.env` nem valores reais.

| Variável                       | Uso                                                                   |
| ------------------------------ | --------------------------------------------------------------------- |
| `DATABASE_URL`                 | URL PostgreSQL usada pelo Prisma                                      |
| `POSTGRES_PORT`                | porta local publicada pelo Docker Compose, padrão `5433`              |
| `AUTH_SECRET`                  | segredo de assinatura das sessões; use pelo menos 32 caracteres       |
| `REGISTRATION_BOOTSTRAP_TOKEN` | código secreto aceito somente para a primeira conta de um banco vazio |
| `APP_URL`                      | URL pública/local da aplicação                                        |
| `DEFAULT_TIMEZONE`             | timezone IANA padrão, inicialmente `America/Sao_Paulo`                |

## Arquitetura

O projeto usa um monólito modular full-stack:

- `src/app`: App Router do Next.js, páginas e route handlers;
- `src/lib`: infraestrutura compartilhada, Prisma, ambiente, sessão e validações;
- `src/server/domain`: regras puras e testáveis, como ciclos de escala e score de disponibilidade;
- `src/server/authorization`: helpers de autorização server-side para membros, administradores e owners;
- `prisma/schema.prisma`: modelo relacional PostgreSQL do núcleo do domínio;
- `prisma/migrations`: alterações de schema versionadas;
- `prisma/seed.ts`: dados de demonstração, mantidos fora das migrations;
- `tests/unit`, `tests/integration`, `tests/e2e`: testes por camada.

O núcleo modela usuários, comunidades, memberships, convites, escalas, overrides, feriados, eventos, RSVP, votações, opções, votos, snapshots de sorteios e rateios de despesas. Timestamps são armazenados em UTC; datas civis de escala, feriados, compras e opções de data usam `DATE` no PostgreSQL. O timezone inicial é explícito e configurável.

Autenticação usa sessão JWT assinada em cookie `httpOnly`, `sameSite=lax` e `secure` em HTTPS. Senhas são armazenadas somente como hash bcrypt; trocar a senha invalida as demais sessões. O rate limit dos endpoints sensíveis é atômico e persistido no PostgreSQL, funcionando entre múltiplas instâncias. A aplicação também envia CSP, HSTS, proteção contra framing e outros headers defensivos. A autorização não depende da interface: os helpers server-side verificam membership e papel antes de qualquer consulta ou mutação privada.

## Funcionalidades da Fase 1

- cadastro somente por convite, login, sessão protegida e logout;
- bootstrap protegido por código secreto exclusivamente para a primeira conta da instalação;
- rate limiting persistente nos endpoints sensíveis e validação de origem em mutações;
- edição de nome, avatar, timezone, senha e nome específico por comunidade;
- criação e listagem de múltiplas comunidades por usuário;
- papéis `OWNER`, `ADMIN` e `MEMBER` com autorização server-side;
- proteção contra auto-remoção, alteração do próprio papel e comunidade sem owner;
- listagem e remoção de membros sem expor e-mails desnecessariamente;
- convites sem vínculo obrigatório com e-mail, imprevisíveis, persistidos somente como hash, com expiração, revogação e limite de usos;
- criação da conta, membership e consumo do convite na mesma transação;
- qualquer usuário cadastrado pode criar comunidades; somente owners e administradores podem gerar ou revogar convites.

## Funcionalidades das Fases 2 e 3 — disponibilidade do grupo

- calendário pessoal mensal com status calculado para cada dia;
- ocorrências manuais de dia inteiro ou intervalo, incluindo disponibilidade, trabalho, folga, férias e indisponibilidade;
- escalas semanais com padrão configurável para os sete dias;
- ciclos genéricos N×M, incluindo 12×36, 4×2, 5×1 e 6×1;
- início e fim de turno com precisão de minutos, incluindo horários noturnos que terminam no dia
  seguinte, disponibilidade automática fora do expediente e horários livres detalhados no
  calendário geral;
- feriados comunitários administráveis e identificados nas visões mensal e em lista, sem presumir que
  toda pessoa em escala está de folga;
- folgas extras pessoais por data ou intervalo, com observação e precedência sobre a escala recorrente;
- prévia da escala antes da persistência, edição completa, ativação, pausa e remoção;
- edição e remoção de ocorrências manuais de dia inteiro ou intervalos;
- precedência determinística `override manual > escala recorrente > UNKNOWN`;
- calendário consolidado acessível apenas aos membros, sem exposição de e-mails;
- detalhes por dia com membros agrupados por estado e contagens separadas de disponibilidade completa, parcial, trabalho, indisponibilidade e ausência de informação;
- quadrados do calendário mensal divididos em dia inteiro, manhã, tarde e noite, cada período com
  contagem e intensidade visual próprias;
- ranking transparente das melhores datas: disponibilidade/folga/férias valem `1`, parcial vale `0,5` e os demais estados valem `0`;
- presets de manhã (6h–12h), tarde (12h–18h), noite (após 18h) e intervalo personalizado;
- desempate por score, pessoas completamente disponíveis, menor quantidade de desconhecidos e data;
- filtros por intervalo, período do dia, finais de semana, mínimo de pessoas e membros específicos;
- datas civis de escala armazenadas como `DATE` e intervalos convertidos com timezone IANA;
- consultas limitadas a 93 dias para evitar cálculo desnecessário de longos períodos.

## Funcionalidades da Fase 4 — eventos e participantes

- criação de eventos por qualquer membro da comunidade;
- edição e cancelamento pelo criador, administradores ou owners;
- cancelamento lógico, preservando detalhes e histórico de respostas;
- eventos com data/hora ou dia inteiro, timezone IANA, local, endereço, link, custo e moeda;
- limite opcional de participantes com vagas restantes, sem bloquear confirmações acima do limite;
- RSVP único por membro nos estados `Vou`, `Talvez` e `Não vou`, substituído ao mudar a resposta;
- opção do organizador para desativar `Talvez`, aplicada também no servidor;
- presença por dias específicos em eventos de vários dias, quando habilitada pelo organizador;
- dias escolhidos exibidos junto ao participante, com “evento inteiro” como comportamento padrão;
- contagens e participantes agrupados por resposta, usando o nome específico da comunidade quando existir;
- filtros e paginação de eventos próximos, passados ou todos;
- autorização server-side em consultas e mutações, sem exposição a pessoas fora da comunidade;
- validação de entrada na API e constraints de integridade no PostgreSQL.

## Funcionalidades da Fase 5 — votações

- criação de votações por qualquer membro da comunidade;
- escolha única, múltipla escolha e votação de datas;
- opções com ordem estável e validação contra opções vazias ou repetidas;
- cards opcionais com descrição, página web e local para comparar passeios e hospedagens;
- álbum privado com até 6 fotos por opção, envio múltiplo, navegação horizontal no celular e
  visualização ampliada em tela cheia;
- fotos armazenadas no PostgreSQL e servidas somente para membros autenticados da comunidade;
- prazo opcional e encerramento manual pelo criador, administradores ou owners;
- configuração para permitir ou impedir alteração e remoção do voto;
- substituição transacional do voto, inclusive seleções múltiplas;
- resultados imediatos com votantes únicos, votos, percentuais e nomes dos participantes;
- votação de datas com disponibilidade completa, pessoas sem informação e score exibidos separadamente dos votos;
- sugestões de datas ordenadas pelo cálculo de disponibilidade da comunidade;
- proteção server-side contra votos encerrados, opções de outra votação e acesso externo;
- filtros e paginação de votações abertas, encerradas ou todas.

## Funcionalidades da Fase 6 — dashboard

- serviço agregado protegido por membership, sem acesso direto da página ao banco;
- três melhores oportunidades dos próximos 30 dias segundo o score transparente de disponibilidade;
- ações para criar evento ou votação já associadas à data escolhida;
- até cinco próximos eventos publicados, com local, confirmações e resposta do usuário;
- até três votações abertas, com tipo, participação, opção líder e prazo;
- resumo separado de sábado e domingo do próximo fim de semana;
- disponibilidade completa e ausência de informação nos próximos sete dias;
- empty states com ações úteis para comunidades ainda sem eventos ou votações;
- skeleton de carregamento e layout responsivo com cards horizontais no mobile;
- consultas agregadas e limitadas para evitar N+1 e pré-cálculos desnecessários.

## Funcionalidades da Fase 7 — refinamento de interface

- identidade visual própria do Juntaê em verde-petróleo, coral e superfícies claras de alto contraste, com hierarquia e estados interativos consistentes;
- seletor acessível entre os temas Juntaê, Clássico, Solar e Oceano, com preferência persistida no navegador e aplicada antes da renderização;
- calendário consolidado com visualização mensal ou em lista, navegação entre meses e seleção detalhada de cada dia;
- níveis de disponibilidade identificados por cor, números, textos e legenda, sem depender exclusivamente da cor;
- criação de evento ou votação diretamente do dia selecionado no calendário;
- barra inferior mobile com Início, Agenda, Eventos, Votações e menu Mais;
- layouts verificados sem rolagem horizontal em viewport de 390 px e alvos de toque com pelo menos 44 px;
- link para pular ao conteúdo, navegação atual com `aria-current`, foco visível e suporte a movimento reduzido;
- labels e descrições acessíveis para dias do calendário, controles, status e navegação mensal;
- estado global de erro com ação de nova tentativa e retorno seguro para as comunidades.
- compartilhamento de eventos e votações pela Web Share API, WhatsApp como fallback e cópia direta do link;
- mensagens assíncronas anunciadas por leitores de tela e auditoria automatizada com axe-core;

## Geradores aleatórios — primeiro módulo pós-MVP

- oito presets: times, grupos de até N pessoas, carros, itens por pessoa, escolha de pessoas, escolha de item, ordem aleatória e duplas;
- fontes desacopladas: membros selecionados, confirmados de evento, confirmados + talvez e nomes manuais;
- distribuição uniforme, capacidade de carros e comportamento explícito para quantidade ímpar em duplas;
- regras opcionais para manter pessoas juntas ou separadas e capitães de times;
- validação de restrições incompatíveis antes de apresentar o resultado;
- aleatoriedade criptograficamente segura no servidor, sem `Math.random()`;
- resultado temporário por padrão, com ações para repetir, editar, copiar e compartilhar;
- salvamento opcional com snapshots imutáveis, página permanente, histórico e exclusão autorizada;
- autorização por comunidade e validação server-side tanto na geração quanto no salvamento.

## Rateios — módulo pós-MVP

- rateios independentes ou vinculados opcionalmente a eventos;
- participantes confirmados no evento pré-selecionados, com ajuste manual antes da criação;
- múltiplas compras e múltiplos pagadores no mesmo rateio;
- divisão igual em centavos, com reconciliação exata de restos e sem perda de valor;
- saldo individual com total pago, cota devida e valor a pagar ou receber;
- lista líquida e reduzida de transferências indicando quem paga quem;
- participantes lançam as próprias compras; criador, owner e administrador podem lançar em nome de
  qualquer participante;
- fechamento e reabertura autorizados, com bloqueio de alterações enquanto fechado;
- cálculo informativo, sem processar pagamentos ou armazenar dados bancários.

Rotas principais desta fase:

- `/app`: seleção e criação de comunidades;
- `/app/[community]`: dashboard privado;
- `/app/[community]/members`: membros e papéis;
- `/app/[community]/settings`: informações e convites;
- `/app/[community]/agenda/me`: calendário e ocorrências pessoais;
- `/app/[community]/agenda/schedules`: escalas semanais e N×M;
- `/app/[community]/agenda`: calendário consolidado e melhores datas;
- `/app/[community]/events`: próximos eventos e histórico;
- `/app/[community]/events/new`: criação de evento;
- `/app/[community]/events/[eventId]`: detalhes, RSVP e participantes;
- `/app/[community]/events/[eventId]/edit`: edição autorizada;
- `/app/[community]/polls`: votações abertas e histórico;
- `/app/[community]/polls/new`: escolha única, múltipla ou datas sugeridas;
- `/app/[community]/polls/[pollId]`: voto, participantes e resultado;
- `/app/[community]/polls/[pollId]/edit`: edição das configurações autorizadas;
- `/app/[community]/randomizers`: geradores e histórico opcional de resultados;
- `/app/[community]/randomizers/[runId]`: snapshot permanente de um resultado salvo;
- `/app/[community]/cost-shares`: criação e histórico de rateios;
- `/app/[community]/cost-shares/[costShareId]`: compras, saldos e acerto final do rateio;
- `/settings/profile`: perfil pessoal e segurança;
- `/join/[token]`: aceite de convite.
- `/sobre`: informações do projeto e histórico de versões.

Recuperação de senha por e-mail não foi adicionada porque o projeto ainda não possui provedor de e-mail configurado. A troca autenticada de senha já está disponível no perfil.

## Decisões técnicas

- Next.js App Router + React para manter frontend e backend no monólito recomendado;
- Prisma para acesso fortemente tipado ao PostgreSQL e migrations versionadas;
- Zod para validar entradas externas;
- `jose` + `bcryptjs` para a fundação de autenticação sem duplicar dados de usuário;
- Vitest para regras de domínio e Playwright com axe-core para fluxos E2E e acessibilidade;
- Playwright usa porta `3100` e `.next-e2e`, evitando reutilizar ou alterar o servidor de desenvolvimento aberto;
- tokens CSS compartilhados para cores, superfícies, foco, responsividade e estados, sem adicionar uma dependência de design system;
- Docker Compose fornece somente o PostgreSQL para que o servidor possa ser executado diretamente com Node durante o desenvolvimento.

## Escopo posterior ao MVP

Os módulos prioritários de Geradores Aleatórios e Rateios do backlog pós-MVP já estão implementados. Recuperação de senha por e-mail, PWA/notificações, Games, Caronas, Interesses e integrações externas continuam no backlog. Consulte `PRODUCT_SPEC.md` para a fonte de verdade funcional e técnica completa.
