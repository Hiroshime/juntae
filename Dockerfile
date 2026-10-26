ARG NODE_IMAGE=node:22.23.3-alpine3.23

FROM ${NODE_IMAGE} AS dependencies

RUN apk upgrade --no-cache \
  && apk add --no-cache libc6-compat openssl 'zlib>=1.3.2-r1' 'musl>=1.2.5-r24'
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder

RUN apk upgrade --no-cache \
  && apk add --no-cache libc6-compat openssl 'zlib>=1.3.2-r1' 'musl>=1.2.5-r24'
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV DEFAULT_TIMEZONE=America/Sao_Paulo

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN DATABASE_URL=postgresql://juntae:build-only@localhost:5432/juntae?schema=public \
  node_modules/.bin/prisma generate
RUN DATABASE_URL=postgresql://juntae:build-only@localhost:5432/juntae?schema=public \
  AUTH_SECRET=build-only-secret-with-at-least-32-characters \
  APP_URL=http://localhost:3000 \
  npm run build

FROM ${NODE_IMAGE} AS runner

RUN apk upgrade --no-cache \
  && apk add --no-cache libc6-compat openssl 'zlib>=1.3.2-r1' 'musl>=1.2.5-r24' \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
RUN DATABASE_URL=postgresql://juntae:build-only@localhost:5432/juntae?schema=public \
  node_modules/.bin/prisma generate

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node_modules/.bin/next start"]
