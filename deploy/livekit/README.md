# Caddy do LiveKit com DNS-01

Esta imagem complementa a instalação externa do LiveKit usada pelo Juntaê. Ela preserva o suporte
a configuração YAML e roteamento Layer 4 da imagem de referência do LiveKit e adiciona o provedor
DNS da Cloudflare. Assim, o Caddy emite e renova certificados pelo desafio DNS-01 sem expor a porta
80 da residência.

## Publicação

A imagem é publicada pelo workflow **Publicar Caddy do LiveKit**. No GitHub, abra **Actions**, escolha
o workflow, selecione **Run workflow** e informe uma versão, como `1.0.0`. Alternativamente, envie uma
tag exclusiva no formato `livekit-caddy-v1.0.0`; ela não aciona a publicação da aplicação Juntaê.

O workflow publica as arquiteturas `linux/amd64` e `linux/arm64` como:

```text
hiroshime/juntae-livekit-caddy:<versão>
hiroshime/juntae-livekit-caddy:latest
```

Ele reutiliza `DOCKERHUB_USERNAME` nas variables e `DOCKERHUB_TOKEN` nos secrets do repositório.
Nenhuma credencial da Cloudflare participa do build.

## Token da Cloudflare

Crie um API Token dedicado e limitado à zona `chamelissa.site`, com estas permissões:

```text
Zone / Zone / Read
Zone / DNS / Edit
```

Cadastre o valor somente no ambiente do container Caddy:

```text
CLOUDFLARE_API_TOKEN=<token>
```

Não salve o token neste diretório, no Compose ou no GitHub.

## ZimaOS

1. Pare o pacote do LiveKit.
2. Copie `caddy/caddy.yaml` para `/DATA/AppData/juntae-livekit/caddy.yaml`.
3. Use o serviço abaixo no Compose do pacote, mantendo Caddy e LiveKit na mesma rede Docker.
4. Adicione `CLOUDFLARE_API_TOKEN` nas variáveis do aplicativo.
5. Salve e recrie o pacote.

```yaml
caddy:
  image: hiroshime/juntae-livekit-caddy:1.0.0
  restart: unless-stopped
  command:
    - run
    - --config
    - /etc/caddy.yaml
    - --adapter
    - yaml
  environment:
    CLOUDFLARE_API_TOKEN: ${CLOUDFLARE_API_TOKEN:?Defina CLOUDFLARE_API_TOKEN}
  ports:
    - "9443:443/tcp"
  volumes:
    - /DATA/AppData/juntae-livekit/caddy.yaml:/etc/caddy.yaml:ro
    - /DATA/AppData/juntae-livekit/caddy-data:/data
  depends_on:
    - livekit
```

O bind mount deve apontar para um arquivo existente; se o caminho de origem não existir, o Docker
pode criar um diretório e impedir o Caddy de carregar a configuração.

Os registros `voz.juntae.chamelissa.site` e `turn.juntae.chamelissa.site` permanecem como
**DNS only** na Cloudflare. Para uma operadora que bloqueia 80/443, uma topologia possível é:

```text
TCP público 8032 -> ZimaOS 9443 (sinalização do LiveKit)
TCP público 5349 -> ZimaOS 9443 (TURN/TLS, separado pelo SNI)
TCP público 7881 -> ZimaOS 7881 (fallback WebRTC/TCP)
UDP público 7882 -> ZimaOS 7882 (mídia WebRTC)
UDP público 3478 -> ZimaOS 3479 (TURN/UDP com o mapeamento atual)
```

Nesse cenário, configure o Juntaê com:

```text
LIVEKIT_URL=wss://voz.juntae.chamelissa.site:8032
```

`LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` continuam iguais aos definidos no servidor LiveKit.

## Validação

Nos logs do Caddy, procure por `certificate obtained successfully`. Dentro do container, confirme
os módulos compilados:

```sh
caddy list-modules | grep -E "layer4|dns.providers.cloudflare"
```

Erros comuns:

- `module not registered`: o ZimaOS ainda está usando a imagem anterior;
- `Invalid request headers`: token ausente ou inválido;
- `requires permission`: faltou acesso de leitura da zona ou edição DNS;
- `expected 1 zone, got 0`: o token não possui acesso à zona correta;
- `connection refused livekit:7880`: Caddy e LiveKit não compartilham a rede Docker.
