# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder

ARG TARGETOS
ARG TARGETARCH
ARG CADDY_VERSION=v2.11.4

RUN apk add --no-cache ca-certificates git

WORKDIR /workspace

RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest

RUN CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    /go/bin/xcaddy build "${CADDY_VERSION}" \
    --with github.com/abiosoft/caddy-yaml \
    --with github.com/mholt/caddy-l4 \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2.11.4-alpine

COPY --from=builder /workspace/caddy /usr/bin/caddy

