# Juntaê

Juntaê é um hub privado para comunidades de amigos. A primeira versão conecta disponibilidade, escalas, eventos e votações para responder rapidamente: **quando estamos livres e o que podemos fazer juntos?** Os módulos pós-MVP adicionam sorteios reutilizáveis, rateios de despesas, comunicação social, salas de voz privadas, e-mail segregado por comunidade e minigames com rankings.

O MVP descrito no `PRODUCT_SPEC.md` está implementado. Já é possível configurar escalas, comparar o calendário consolidado, organizar eventos, decidir opções ou datas em grupo e conversar em um feed privado com textos, imagens, vídeos, comentários e reações. Comunicados administrativos aceitam formatação segura e podem ser enviados aos membros pelo SMTP próprio da comunidade. Novas contas entram somente por convite de uma comunidade; qualquer usuário cadastrado pode criar novas comunidades.

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

O seed cria a comunidade `Juntaê`, oito usuários, escalas de demonstração, overrides, eventos, votações, um sorteio salvo e uma sala de jogo da velha com histórico. As datas são calculadas em relação ao dia da execução. Para entrar com um usuário de demonstração, use qualquer e-mail `@juntae.local` criado no seed (por exemplo, `ana@juntae.local`) e a senha `demo1234`. Ao ser executado sobre uma instalação anterior, o seed migra os registros de demonstração `@galera.local` e o slug `galera` sem trocar seus IDs.

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
  --tag docker.io/SEU_USUARIO/juntae:0.24.0 \
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

Depois abra **Actions → Publicar imagem Docker → Run workflow**, informe `0.24.0` e execute. O workflow
publicará `SEU_USUARIO/juntae:0.24.0` e `SEU_USUARIO/juntae:latest`. Fazer push de uma tag Git como
`v0.24.0` também publica automaticamente as tags `0.24.0` e `latest`.

### 2. Preparar as variáveis do ZimaOS

```bash
cp .env.zima.example .env.zima
openssl rand -hex 32
openssl rand -base64 48
openssl rand -hex 32
openssl rand -base64 32
```

Edite `.env.zima`:

- `JUNTAE_IMAGE`: imagem e versão publicadas no Docker Hub;
- `POSTGRES_PASSWORD`: primeiro valor gerado, em hexadecimal para ser seguro dentro da URL;
- `AUTH_SECRET`: segundo valor gerado;
- `REGISTRATION_BOOTSTRAP_TOKEN`: terceiro valor, usado somente para criar a primeira conta de um banco vazio;
- `EMAIL_CREDENTIALS_ENCRYPTION_KEY`: quarto valor, usado para cifrar as senhas SMTP de cada comunidade;
- `APP_URL`: URL exata usada no navegador, como `http://192.168.1.50:3080` ou um domínio HTTPS;
- `JUNTAE_DATA_PATH`: diretório persistente do ZimaOS, por padrão `/DATA/AppData/juntae`.

Para habilitar **Comunicação → Voz**, suba um servidor LiveKit separado e informe `LIVEKIT_URL`,
`LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`. A URL precisa ser pública e acessível pelo navegador, como
`wss://voz.seudominio.com`. O Compose do Juntaê não inclui o servidor de mídia: isso mantém banco e
app isolados e permite atualizar o LiveKit sem interromper o restante do sistema. Sem essas três
variáveis, a interface de canais permanece disponível, mas o botão de entrada fica desabilitado.

Para habilitar **Esqueci minha senha**, configure também as seis variáveis
`PASSWORD_RESET_SMTP_*`/`PASSWORD_RESET_FROM_*` do arquivo. No Gmail, use `smtp.gmail.com`, porta
`465`, o endereço da conta como usuário/remetente e uma senha de aplicativo sem espaços. Esse
remetente pertence à instalação e não substitui o SMTP independente configurado dentro de cada grupo.

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

Para atualizar, publique uma nova versão imutável, como `0.24.0`, altere `JUNTAE_IMAGE`, gere novamente
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

| Variável                           | Uso                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`                     | URL PostgreSQL usada pelo Prisma                                               |
| `POSTGRES_PORT`                    | porta local publicada pelo Docker Compose, padrão `5433`                       |
| `AUTH_SECRET`                      | segredo de assinatura das sessões; use pelo menos 32 caracteres                |
| `REGISTRATION_BOOTSTRAP_TOKEN`     | código secreto aceito somente para a primeira conta de um banco vazio          |
| `APP_URL`                          | URL pública/local da aplicação                                                 |
| `DEFAULT_TIMEZONE`                 | timezone IANA padrão, inicialmente `America/Sao_Paulo`                         |
| `EMAIL_CREDENTIALS_ENCRYPTION_KEY` | chave Base64 de 32 bytes para cifrar credenciais SMTP por comunidade           |
| `PASSWORD_RESET_SMTP_HOST`         | hostname SMTP transacional; configure junto das outras cinco variáveis         |
| `PASSWORD_RESET_SMTP_PORT`         | `465` para TLS direto ou `587` para STARTTLS                                   |
| `PASSWORD_RESET_SMTP_USER`         | usuário da conta SMTP da instalação                                            |
| `PASSWORD_RESET_SMTP_PASSWORD`     | senha SMTP/senha de aplicativo da instalação                                   |
| `PASSWORD_RESET_FROM_NAME`         | nome exibido no remetente, por exemplo `Juntaê`                                |
| `PASSWORD_RESET_FROM_EMAIL`        | endereço exibido no remetente                                                  |
| `LIVEKIT_URL`                      | endpoint público `wss://` do servidor de voz LiveKit                           |
| `LIVEKIT_API_KEY`                  | chave server-side do LiveKit; configure junto das outras duas                  |
| `LIVEKIT_API_SECRET`               | segredo server-side do LiveKit, nunca exposto ao navegador                     |
| `OLLAMA_BASE_URL`                  | URL do Ollama acessível pelo container, por exemplo `http://10.198.1.56:11434` |
| `OLLAMA_REQUEST_TIMEOUT_MS`        | timeout de geração entre `5000` e `180000`, padrão `90000`                     |

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

O núcleo modela usuários, tokens de recuperação armazenados somente como hash, comunidades,
memberships, convites, escalas, overrides, feriados, eventos, RSVP, votações, opções, votos,
snapshots de sorteios, rateios de despesas, canais de voz, salas e partidas de jogos. Timestamps são armazenados em
UTC; datas civis de escala, feriados, compras e opções de data usam `DATE` no PostgreSQL. O timezone
inicial é explícito e configurável.

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
  contagem e intensidade visual próprias, destacando o resumo do dia inteiro;
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
- criador e administradores podem adicionar ou remover fotos pelo editor enquanto a votação estiver
  aberta, sem alterar as opções ou os votos existentes;
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

### Conta e pagamentos do evento

Na página de um evento, o criador ou um administrador pode clicar em **Habilitar controle de
pagamentos**. A conta soma o custo base dividido entre confirmados e as cotas dos rateios vinculados,
respeitando os participantes próprios de cada rateio. Compras já pagas são abatidas automaticamente.
Exemplo: evento de R$ 3.000 e rateios de R$ 500 e R$ 300 entre dez pessoas dão uma cota de R$ 380;
quem comprou R$ 500 tem R$ 120 a receber.

- Registre vários recebimentos e reembolsos já realizados, inclusive parcelas antecipadas e aportes
  próprios da organização. Um recebimento pode ser lançado mesmo com saldo zerado e o excesso vira
  crédito a favor da pessoa. Os participantes consultam a conta; somente criador do evento e
  administradores confirmam registros. Não há processamento de dinheiro.
- O acerto é centralizado com a organização: não repita pagamentos das sugestões isoladas de
  cada rateio. Não cadastre o valor da locação no custo base e novamente como compra.
- Contas abertas acompanham alterações de custos, RSVPs e rateios. Presença parcial não reduz
  automaticamente a cota do evento. Moedas diferentes bloqueiam acertos; não existe câmbio automático.
- É possível anular registros incorretos preservando autor, data e histórico. Recebimentos acima do
  saldo atual são permitidos para formar crédito; reembolsos acima do crédito e operações com dados
  desatualizados são recusados.
- **Fechar conta do evento** exige todos os saldos zerados e guarda os valores e nomes daquele
  momento. Alterações posteriores nas fontes não alteram a conta fechada. **Reabrir conta** recalcula
  com os dados atuais, preservando pagamentos. Fechar a conta não cancela nem conclui o evento.
- Contas sem pagamentos podem ser desabilitadas. Havendo histórico, use o fechamento.

Atualização local: pare o servidor, execute `npm run db:generate` e `npm run db:migrate`, e inicie
novamente com `npm run dev`. A migration `0012_event_payments` mantém eventos existentes com o
controle desabilitado. No Docker, as migrations são aplicadas pelo entrypoint ao iniciar a nova imagem.

### Rateios individuais

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

## Fundão da comunidade

A página **Fundão** organiza contribuições mensais para passeios e atividades futuras. Cada membro
faz o PIX fora do Juntaê e registra o valor, mês e data. O lançamento fica pendente até um owner ou
administrador confirmar; somente depósitos confirmados aumentam o saldo.

Administradores configuram uma contribuição sugerida, nome do recebedor, chave PIX, código Copia e
Cola e uma imagem de QR Code. Esses dados são privados para membros da comunidade. O QR Code é
convertido para WebP, tem metadados removidos e pode ter até 2 MB.

O saldo pertence ao membro que depositou. Administradores podem aplicar parte dele a um evento ou
outra atividade, sempre com finalidade e data, sem permitir saldo negativo. Aprovações, recusas, usos,
cancelamentos e anulações permanecem no histórico. O sistema não movimenta dinheiro nem consulta o
banco automaticamente. Em eventos com a conta aberta, o crédito aparece separadamente e reduz o
valor pendente do membro sem ser duplicado como pagamento. Custos e abatimentos usam sinais visuais
consistentes, e uma tentativa em conta já quitada informa o motivo no próprio formulário. A migration
`0039_community_fund` cria o caixa e seus lançamentos.

## IA contextual por comunidade

O **Assistente IA** usa um Ollama privado para responder perguntas sobre os próprios dados da
comunidade. Owners e administradores habilitam o recurso em **Configurações**, escolhem um modelo já
instalado e liberam individualmente eventos, disponibilidade dos próximos 14 dias, votações,
comunicados e desafios. Cada membro possui histórico próprio: outros membros e administradores não
conseguem ler suas conversas.

O endereço do Ollama é global e fica somente em `OLLAMA_BASE_URL`; ele nunca é salvo pela comunidade
nem enviado ao navegador. O contexto não inclui e-mails, credenciais, fotos ou dados financeiros. A IA
é apenas consultiva: não cria eventos, não vota e não altera registros. Respostas podem conter erros e
devem ser confirmadas nas páginas originais.

Para reduzir a latência em modelos locais pequenos, cada pergunta recebe somente as fontes relacionadas
ao assunto identificado; perguntas genéricas continuam podendo consultar todas as fontes autorizadas.
Confirmações de eventos são enviadas em grupos explícitos de quem vai, talvez vá, não vai ou ainda não
respondeu. O botão de teste executa uma inferência curta real, e não apenas consulta a lista de modelos.

Para desenvolvimento local, configure um endereço alcançável pelo processo Next.js:

```env
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_REQUEST_TIMEOUT_MS="90000"
```

No Docker/ZimaOS, `localhost` apontaria para o próprio container Juntaê. Use o IP LAN do ZimaOS, um
hostname compartilhado entre containers ou `host.docker.internal` quando esse nome estiver
configurado. O Ollama precisa aceitar conexões vindas da rede Docker. Depois de reiniciar o Juntaê,
abra **Configurações → Inteligência artificial**, salve o nome exato retornado por `ollama ls` e use
**Testar e listar modelos**. A migration `0040_contextual_ai` cria configurações e conversas privadas.

Rotas principais desta fase:

- `/app`: seleção e criação de comunidades;
- `/app/[community]`: dashboard privado;
- `/app/[community]/social`: publicações, comunicados, comentários e reações da comunidade;
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
- `/app/[community]/fund`: depósitos, PIX, saldos e histórico do Fundão;
- `/app/[community]/ai`: assistente contextual e histórico privado do membro;
- `/app/[community]/games`: catálogo inicial, salas abertas e rankings;
- `/app/[community]/games/[roomId]`: sala de espera e partidas de jogo da velha ou forca;
- `/app/[community]/games/bell-hop`: arcade solo Salto dos Sinos e seus rankings;
- `/app/[community]/games/tower-stack`: arcade solo Torre em Equilíbrio e seus rankings;
- `/app/[community]/games/arena`: criação, Vila do Sol e duelos solo da Arena dos Campeões;
- `/app/[community]/games/arena/expeditions`: treinos, missões e atributos;
- `/app/[community]/games/arena/merchants`: lojas, equipamentos e inventário;
- `/app/[community]/games/arena/camp`: evolução, itens e status do Acampamento;
- `/app/[community]/games/arena/pvp`: incursões automáticas aos Refúgios da comunidade;
- `/settings/profile`: perfil pessoal e segurança;
- `/forgot-password`: solicitação genérica de recuperação por e-mail;
- `/reset-password#token=...`: criação da nova senha sem expor o token ao servidor no acesso inicial;
- `/join/[token]`: aceite de convite;
- `/sobre`: informações do projeto e histórico de versões.

Na tela de login, **Esqueci minha senha** envia um link de uso único válido por 30 minutos. O remetente
é global da instalação porque a mesma conta pode participar de várias comunidades; credenciais de
uma comunidade nunca podem redefinir uma conta inteira. Pedidos sempre exibem a mesma confirmação,
sem revelar se um e-mail está cadastrado. A troca invalida links anteriores e todas as sessões abertas.

## Jogos da comunidade

Acesse **Jogos** no menu da comunidade (no celular: **Mais → Jogos**). Qualquer membro pode criar
uma sala de jogo da velha e ocupa a primeira das duas vagas; abrir uma sala captura automaticamente
a vaga disponível. Quando os dois jogadores marcam
**Estou pronto**, a rodada começa automaticamente; X joga primeiro e cada pessoa marca uma casa
vazia por vez. Vitória, empate e desistência ficam registrados, e a sala retorna à espera para a
próxima rodada.

O criador e administradores escolhem se o jogador inicial alterna a cada rodada ou é sorteado.
Essa regra só muda enquanto ninguém está pronto. Os placares mostram vitórias da semana atual
(segunda a domingo) e do mês atual no fuso `DEFAULT_TIMEZONE`. A atualização da sala ocorre a cada
menos de um segundo enquanto a aba está visível; jogadas e mudanças continuam validadas atomicamente
no servidor, inclusive sob cliques simultâneos. Sair retorna à página de jogos. Se o último jogador
sair, a sala some da listagem, mas suas partidas permanecem no histórico dos rankings.

Cada membro pode ocupar somente uma sala aberta por comunidade; entrar ou criar outra transfere a vaga
e deixa a anterior atomicamente. Ao usar o menu, voltar ou fechar a página, o navegador registra a
saída; uma partida em andamento segue a regra de desistência ou cancelamento do jogo. Na espera, a lista
mostra quem é o anfitrião e os estados **Pronto** e **Aguardando**. Placar e posições ficam reservados
para a partida e seu resultado.

A migration `0021_games_tic_tac_toe` cria salas, vagas e histórico de partidas, com no máximo uma
partida ativa por sala. Em uma instalação existente, atualize a imagem ou execute `npm run
db:generate && npm run db:migrate`; não é necessário rodar o seed.

O catálogo também oferece **Jogo da forca** para 2 a 5 pessoas. A sala sorteia a ordem e o mestre
da primeira palavra; os demais arriscam uma letra ou a palavra inteira em seus turnos. Cada erro
desenha uma das dez partes do boneco e cada palavra descoberta vale um ponto. O criador escolhe de
1 a 20 palavras, e há rankings próprios semanais e mensais. A migration `0022_hangman_game`
armazena sessões, rodadas, palpites e placares; a palavra secreta permanece no servidor até o fim
da rodada.

O terceiro jogo é **Salto dos Sinos**, um arcade solo original inspirado na mecânica clássica de
subir por plataformas. Mouse, toque ou setas movem o coelho; o salto é automático ao pousar e os
sinos ficam menores, mais distantes e mais rápidos ao longo da subida. A pontuação cresce a cada sino, é recalculada no servidor e
alimenta recordes semanais e mensais da comunidade. A migration `0023_bell_hop_arcade` guarda as
tentativas, sementes e métricas validadas. Nenhum asset ou código do jogo de referência é utilizado.

O quarto jogo é **Torre em Equilíbrio**, um arcade solo de um toque. Cada bloco oscila em um pêndulo
antes de cair; encaixes fora do centro fazem a construção inclinar e balançar, mas a torre permanece
de pé enquanto o centro de massa dos andares superiores continuar sobre uma base segura. São três
vidas por tentativa; o lado inicial alterna e blocos, velocidade e inércia aumentam a exigência com a altura. O servidor recalcula pontos e metros a partir
dos andares válidos. A câmera usa uma escala aberta e blocos rejeitados ricocheteiam nas pontas ou
andares inferiores em vez de atravessar a torre. A migration `0024_tower_stack_arcade` guarda tentativas e rankings semanais e
mensais sem usar código ou assets do jogo de referência.

O quinto jogo é **Stop da Turma**, para 2 a 10 pessoas. Na página de jogos, informe o nome e crie a
sala; dentro dela, escolha de 4 a 10 rodadas, um tempo de 15, 20, 25 ou 30 segundos, as letras do
sorteio e pelo menos oito categorias. As respostas ficam privadas durante a rodada e são salvas
automaticamente. Qualquer jogador pode apertar STOP; se ninguém apertar até o fim do tempo inicial,
todos recebem mais 10 segundos. Em seguida, a turma revisa uma categoria por vez durante 20 segundos,
ou somente 10 quando ninguém respondeu naquela categoria. Respostas com letra incorreta são recusadas
automaticamente e a maioria dos demais jogadores pode invalidar as outras. O servidor avança a revisão
automaticamente. Cada resposta válida vale um ponto, e os líderes finais alimentam rankings semanais e mensais. A migration `0025_stop_game` preserva
sessões, rodadas, respostas, votos de invalidação e placares; a `0026_stop_review_deadline` adiciona
o prazo automático de revisão de forma compatível com bancos que já receberam a migration anterior.

**Arena dos Campeões** é uma campanha solo original. Cada membro cria um gladiador por comunidade,
personaliza sua aparência e distribui os atributos iniciais antes de conhecer a Vila do Sol. Nos
portões do coliseu, escolha entre quatro adversários e lute em rodadas: avançar e recuar alteram a
distância, golpes consomem energia, guarda reduz dano e recuperar fôlego prepara a próxima ação. A IA
usa estilos distintos, e o servidor resolve iniciativa, acerto, dano e nocaute sem confiar no cliente.
Cada rodada reproduz caminhada, ataques, defesa, impacto, recuperação e nocaute na ordem dos eventos
do servidor. Indicadores sobre os lutadores mostram dano, bloqueio, erro, guarda e recuperação no
momento de cada ação, com anúncio acessível e uma alternativa estática para movimento reduzido.
Um duelo ativo pode ser retomado depois de recarregar a página; abandonar conta como derrota.

Na Fase 3, vitórias concedem moedas, experiência e fama conforme a dificuldade; derrotas concluídas
concedem uma pequena experiência e abandono não gera recompensa. A experiência eleva o nível e libera
pontos de atributo. A Forja e o Armeiro vendem equipamentos com nível mínimo e bônus próprios; itens
comprados podem ser equipados por slot e seus bônus entram apenas em duelos iniciados depois da troca.
Armas, armaduras, elmos e escudos equipados também aparecem no avatar da ficha e no campo de batalha;
o conjunto visual fica congelado junto do duelo até ele terminar.

Na Fase 4, os quatro portões formam uma campanha: Caio, Nara e Borin liberam em sequência o confronto
com Aurélia, a Campeã Solar. Vencer a chefe registra uma campanha concluída e inicia um novo ciclo.
Revanche contra rivais anteriores continua disponível sem perder progresso. A Vila mostra o caminho e
o ranking privado da comunidade por campanhas, fama e vitórias. O combate também ganhou efeitos
sonoros sintetizados e opcionais, com preferência salva no navegador.

Depois da primeira campanha, cada ciclo abre uma nova liga com quatro rivais próprios. Nomes,
aparências, estilos, atributos e equipamentos são gerados de forma estável para aquela liga, enquanto
níveis e recompensas aumentam até o teto 60. Os mercadores acompanham essa jornada com conjuntos
completos a cada cinco níveis, cada um com nomes e cores próprios. O servidor aceita os rivais da liga
atual e da imediatamente anterior: os portões atuais ainda abrem em sequência, enquanto a liga
anterior fica inteiramente disponível para conseguir experiência e recursos sem alterar a campanha.
Ligas mais antigas e futuras permanecem bloqueadas.

Da Liga 6 em diante, derrota ou abandono reduz um ponto de fama, até o piso `-1`. Nesse piso, novos
duelos começam com menos energia e precisão e exibem o aviso da penalidade; vencer volta a conceder
fama normalmente. Na área PvP, possíveis alvos revelam apenas duração da incursão e nível do Refúgio,
mantendo nível do gladiador, equipamentos, histórico e atributos ocultos.

Na Fase 5, a ficha também mostra conquistas derivadas, aproveitamento e os oito duelos encerrados mais
recentes. A seção **Reiniciar personagem** permite apagar a jornada e criar outro gladiador. Essa ação
é irreversível e remove ficha, equipamentos, duelos, campanhas e posição no ranking; por segurança, a
interface e o servidor exigem o nome atual digitado exatamente.

O **Refúgio do gladiador** adiciona uma progressão separada em dez estágios. Vitórias concedem mais
pontos conforme a dificuldade, derrotas concluídas concedem um ponto e abandono não concede pontos.
Esses pontos melhoram uma cena própria, que evolui de um acampamento até o Santuário dos imortais. O upgrade é
atômico e não altera os duelos do Coliseu.

As migrations `0027_arena_gladiator_foundation`, `0029_arena_battle_engine` e
`0030_arena_economy_progression` guardam respectivamente a ficha/inventário, os duelos/rodadas e as
recompensas da progressão. A última também remove o antigo campo de pronomes da ficha. A migration
`0031_arena_campaign_rankings` adiciona o avanço cíclico e a base indexada do ranking.
`0032_arena_shelter` cria o Refúgio individual, preserva gladiadores existentes e registra seus pontos
em cada duelo. A **Etapa 2** abre o campo de treinamento e o quadro de missões: atividades duram de uma
a oito horas, rendem experiência e pontos do Refúgio e, nas missões, também moedas. Enquanto está fora,
o gladiador não pode lutar nem alterar a ficha. Missões podem causar incidentes com penalidades
temporárias exibidas na Vila e aplicadas aos novos combates. A conclusão é transacional e acontece
automaticamente na próxima consulta, sem exigir cron. A migration `0033_arena_training_missions`
persiste o cronômetro, recompensas, incidentes e histórico e garante uma única atividade ativa por
gladiador. A Vila agora separa **Expedições**, **Mercadores** e **Acampamento** em páginas próprias.
No Acampamento, moedas compram treze melhorias persistentes que aparecem no cenário e aumentam Defesa,
Conforto, Suprimentos, Treinamento ou Prestígio do Refúgio. Esses status não alteram o Coliseu, mas
agora reforçam a defesa automática do domínio. A migration `0034_arena_shelter_items` registra as
instalações e impede duplicações por Refúgio. A migration `0036_arena_extended_progression` libera os
níveis 7 a 10 sem modificar o progresso já conquistado.

A primeira versão de **PvP** permite saquear Refúgios de outros gladiadores da mesma comunidade. A
duração varia de 30 minutos a duas horas conforme a diferença entre os níveis dos Refúgios. Durante a
incursão, o atacante fica indisponível para qualquer outra tarefa; o defensor recebe um alerta e o
combate é resolvido automaticamente com snapshots dos atributos, equipamentos, sorte limitada e bônus
dos cinco status do Acampamento. Vitória transfere 8% do saldo rival, limitada a 250 moedas, e concede
mais XP; derrota concede XP menor e deixa o atacante ferido por 30 minutos, com indicação visual no
avatar. A migration `0035_arena_pvp_raids` mantém a resolução, o histórico e a transferência de moedas
atômicos e impede dois saques simultâneos pelo mesmo gladiador.

## E-mail próprio por comunidade

Owners encontram **Configurações → E-mail da comunidade**. Cada grupo pode cadastrar sua própria
conta Gmail/Google Workspace ou SMTP público, sem compartilhar credenciais com outras comunidades.
Depois de salvar, envie um teste para o e-mail de login do owner; somente configurações ativas e com
teste aprovado podem enviar. O owner habilita separadamente **Convites** e **Comunicados**. No
formulário **Novo convite**, o destinatário é opcional e não fica vinculado ao token: se o SMTP
falhar, o link ainda aparece para cópia manual.

Senhas SMTP são cifradas com AES-256-GCM e nunca voltam para o navegador. A chave-mestra fica apenas
em `EMAIL_CREDENTIALS_ENCRYPTION_KEY`; faça backup dela em um gerenciador de senhas e não a troque
enquanto houver credenciais salvas. Para Gmail, ative a verificação em duas etapas e use uma senha de
aplicativo, nunca a senha principal. SMTP personalizado aceita somente hostnames públicos nas portas
465/TLS ou 587/STARTTLS; destinos internos são recusados para proteger a rede do ZimaOS.

As migrations `0019_community_email_settings` e `0020_announcement_emails` criam a configuração,
as finalidades e um histórico sem corpo, token ou senha. Owners veem as dez tentativas mais recentes.
Em **Comunicação**, cada comunicado possui uma escolha explícita para enviar o texto a todos os
membros; os destinatários são processados individualmente e não veem os endereços uns dos outros.
Anexos continuam privados no Juntaê e são acessados pelo link incluído na mensagem. Disparos
automáticos de eventos e votações ainda aguardam verificação de e-mail e preferências individuais.

## Comunicação da comunidade

Acesse **Comunicação** no menu da comunidade. Todos os membros podem publicar textos, até quatro
imagens ou vídeos, comentar e escolher uma reação por publicação. Owners e administradores também
podem publicar comunicados gerais e moderar conteúdo; autores removem o próprio conteúdo.
Comunicados aceitam títulos, negrito, itálico, listas e links por uma barra de formatação segura,
com prévia no editor. HTML colado aparece como texto, sem executar código. Quando o owner habilita
essa finalidade em **Configurações → E-mail da comunidade**, o autor do comunicado pode informar um
assunto e enviá-lo também aos endereços de login de todos os membros. A publicação não é perdida se
o SMTP falhar; o resultado mostra quantos envios funcionaram.

O feed e todos os anexos são privados. Imagens de até 6 MB são convertidas para WebP e têm
metadados removidos; vídeos MP4/WebM podem ter até 25 MB. Os arquivos ficam no PostgreSQL e entram
no backup normal do banco. Para instalações com proxy reverso, permita requisições de pelo menos
32 MB na rota `/api/communities/*/social/posts`. A migration `0018_social_communication` cria as
tabelas do módulo e é aplicada automaticamente no fluxo Docker ou por `npm run db:migrate`.

O dashboard destaca uma conversa recente com maior interação. Esta seleção é apenas organizacional:
não torna a publicação pública nem altera quem pode acessá-la.

### Salas de voz

A aba **Comunicação → Voz** lista canais permanentes da comunidade e a presença atual. Todos os
membros podem entrar; owners e administradores criam e removem canais. Cada conexão recebe no servidor
um token curto, restrito à sala solicitada e à publicação do microfone, tela e áudio opcional da tela.
A chamada inicia com o microfone desligado e oferece seleção do dispositivo, silenciamento do próprio
microfone, áudio de saída e indicação de quem está falando. Uma pessoa por vez pode apresentar uma
tela, janela ou aba pelo seletor seguro do navegador, com visualização ampliada e tela cheia. Câmera
continua bloqueada e o Juntaê não grava nem persiste áudio ou imagem.

O transporte de mídia é feito por uma instalação LiveKit separada. Configure nela certificado TLS,
DNS e as portas recomendadas pelo LiveKit; em seguida, copie a mesma chave/segredo para as variáveis do
container Juntaê. Para uso pela internet, `LIVEKIT_URL` deve apontar para o endereço público `wss://`,
e não para um nome interno do Docker. Se usar Cloudflare para o site, confira separadamente os requisitos
de WebRTC/UDP do LiveKit; um túnel HTTP comum não substitui a exposição das portas de mídia.

Instalações residenciais sem acesso público às portas 80/443 podem usar a imagem Caddy própria com
validação DNS-01 pela Cloudflare. O build multi-arquitetura, a configuração sem segredos e o passo a
passo para ZimaOS estão em [`deploy/livekit/`](deploy/livekit/README.md).

A migration `0038_voice_channels` cria os canais e adiciona **Geral** às comunidades existentes.
Novas comunidades já recebem esse canal automaticamente. A presença é consultada no LiveKit, mas uma
indisponibilidade temporária do serviço de voz não impede o uso do restante da comunidade.

## Desafios (Beta) — fases 1, 2 e 3 de 4

Acesse **Desafios (Beta)** no menu da comunidade (no celular: **Mais → Desafios (Beta)**).
Qualquer membro pode criar um desafio fitness com datas, fuso, regras e comparação por pontos,
tempo ou distância. A participação é voluntária, inclusive para o criador. É possível entrar,
sair e voltar enquanto o desafio não terminar nem for cancelado.

Criador e administradores podem editar antes do início e da primeira inscrição. Depois disso,
o combinado fica bloqueado, mesmo se todos saírem. Cancelamentos são definitivos e preservam
o histórico. O último dia é incluído por inteiro no fuso escolhido. Não há cobrança nem prêmios.

Para atualizar uma instalação local existente, pare o servidor e execute:

```bash
npm ci
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run dev
```

A migration `0013_challenges` adiciona desafios e participantes; `0014_challenge_activities`
adiciona treinos e fotos; `0015_challenge_moderation_results` acrescenta moderação, histórico e
resultados finais; `0016_fractional_challenge_scores` permite scores com uma casa decimal, preservando
os valores antigos.
Não é necessário rodar seed nem configurar credenciais externas. No Docker, a nova imagem executa
as migrations pelo fluxo de inicialização já existente; faça backup antes de atualizar.

Plano do módulo (regras completas na seção 30.9 do `PRODUCT_SPEC.md`):

1. **Entregue:** criação, edição protegida, período, regras, participação, cancelamento e telas privadas.
2. **Entregue:** treinos manuais com fotos, feed e ranking real, com critérios de comprovação/pontuação.
3. **Entregue:** moderação com motivo/histórico e consolidação definitiva dos resultados.
4. **Parcial:** seleção de modalidades fitness, personalizadas e pontuação por modalidade;
   outros refinamentos e tipos de desafios continuam planejados.

**Extra final:** integração Android com Health Connect, com seleção privada dos treinos antes
de publicar; depende de validar permissões e compatibilidade. Strava fica adiado, sem bloquear
o módulo web, e qualquer retomada depende das políticas do provedor.

**Modalidades fitness:** no formulário do desafio, habilite as modalidades permitidas e adicione
personalizadas quando necessário. Por pontos, cada modalidade pode valer uma quantidade fixa por
treino ou usar uma métrica, como `5 pontos a cada 3 minutos` e `3 pontos a cada 1 km`. A pontuação
é proporcional ao tempo/distância e arredondada para uma casa decimal: `5 pontos/km × 1,06 km =
5,3 pontos`. A lista e os valores ficam bloqueados após a primeira inscrição ou o início. O limite
diário continua compartilhado entre todas as modalidades. Desafios antigos preservam as sete
modalidades originais e sua pontuação; nenhuma atividade é recalculada.

Arquitetura: `Challenge` guarda o núcleo e uma configuração validada/versionada; `ChallengeParticipant`
guarda a inscrição única e a saída. O marcador de primeira inscrição protege regras mesmo após
remoção de membros. Transações serializáveis coordenam inscrição, edição e cancelamento. Status
temporal é calculado no fuso do desafio, sem cron. Listas são paginadas e não expõem e-mails.
Durante um desafio em andamento, entre e use **Registrar treino** na página dele. Informe o dia,
tipo, duração, distância quando aplicável e até três fotos. O ranking atualiza após publicar ou
remover um treino, sem somar apenas os registros da página atual. Empates compartilham posição.

Critérios padrão (inclusive em desafios antigos): **1 treino/dia, mínimo de 10 minutos e foto
obrigatória**. Ao criar um desafio, é possível ajustar para até 10 treinos/dia, outra duração mínima
ou foto opcional. Critérios seguem o bloqueio das regras após inscrição/início. Registro retroativo
é permitido desde o dia da primeira inscrição, dentro do desafio e nunca em data futura.
O autor pode remover um registro errado e publicar novamente enquanto o desafio estiver ativo.
Quem sai fica fora do ranking, mas mantém seus treinos no feed; ao voltar, recupera a pontuação.

Fotos são privadas, até 6 MB cada (JPEG/PNG/WebP/GIF/AVIF, 40 megapixels). `sharp` decodifica, reduz
para até 1920px, converte em WebP e remove metadados como GPS. Imagens animadas viram fotos estáticas.
Bytes ficam no PostgreSQL e entram no backup do banco. O envio completo tem limite real de 20 MB;
se usar proxy próprio, permita esse tamanho para a rota de atividades. Nenhum volume novo é necessário.
Não há verificação automática de autenticidade das fotos nem conexão com Strava/Health Connect.

**Revisão:** criador e administradores encontram **Desconsiderar treino** em cada publicação.
Informe um motivo; o treino e suas fotos continuam visíveis, mas não pontuam. A opção **Restabelecer
treino** reverte isso com outro motivo. A cota diária continua ocupada enquanto o treino existir.
Revisões e remoções do autor aparecem no histórico privado; revisões concorrentes exigem atualizar.

**Resultado final:** após o último dia, criador e administradores podem revisar os treinos e usar
**Consolidar resultado final**. A confirmação é definitiva, sem reabertura: preserva todos os nomes,
scores, quantidades e posições, mesmo após alterações de perfil ou remoção de membros. Até consolidar,
o ranking é provisório. Desafios cancelados não têm resultado final. Histórico e resultado não guardam
e-mails/fotos e são apagados com a comunidade; quem sai dela perde acesso normalmente.

## Decisões técnicas

- Next.js App Router + React para manter frontend e backend no monólito recomendado;
- Prisma para acesso fortemente tipado ao PostgreSQL e migrations versionadas;
- Zod para validar entradas externas;
- `jose` + `bcryptjs` para a fundação de autenticação sem duplicar dados de usuário;
- LiveKit externo para transporte WebRTC, com tokens curtos e restritos emitidos pelo backend;
- Vitest para regras de domínio e Playwright com axe-core para fluxos E2E e acessibilidade;
- Playwright usa porta `3100` e `.next-e2e`, evitando reutilizar ou alterar o servidor de desenvolvimento aberto;
- tokens CSS compartilhados para cores, superfícies, foco, responsividade e estados, sem adicionar uma dependência de design system;
- Docker Compose fornece somente o PostgreSQL para que o servidor possa ser executado diretamente com Node durante o desenvolvimento.

## Escopo posterior ao MVP

Os módulos prioritários de Geradores Aleatórios, Rateios, Fundão, Comunicação, salas de voz, SMTP por comunidade, recuperação de senha e Games já estão implementados. Notificações automáticas, PWA, novos jogos, Caronas, Interesses e integrações externas continuam no backlog. Consulte `PRODUCT_SPEC.md` para a fonte de verdade funcional e técnica completa.
