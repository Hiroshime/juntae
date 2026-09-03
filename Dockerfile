FROM node:22-alpine AS dependencies

RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://galera:build-only@localhost:5432/galera?schema=public
ENV AUTH_SECRET=build-only-secret-with-at-least-32-characters
ENV APP_URL=http://localhost:3000
ENV DEFAULT_TIMEZONE=America/Sao_Paulo

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run db:generate
RUN npm run build

FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
RUN DATABASE_URL=postgresql://galera:build-only@localhost:5432/galera?schema=public \
  npm run db:generate

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && exec node_modules/.bin/next start"]
