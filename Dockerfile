FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web-build
WORKDIR /app/src/web

COPY src/web/package.json src/web/package-lock.json* ./
RUN npm ci

COPY src/web/ ./
RUN npm run build

# Must be >= the go directive in src/go.mod. The golang images set
# GOTOOLCHAIN=local, so a base image older than go.mod fails outright rather
# than downloading a newer toolchain.
FROM --platform=$BUILDPLATFORM golang:1.25-bookworm AS go-build
WORKDIR /app/src

COPY src/go.mod src/go.sum ./
RUN go mod download

COPY src/ ./
COPY --from=web-build /app/src/web/dist ./web/dist

ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
ARG COMMIT=
# .git is not in the build context, so the commit must come in as a build arg.
RUN PKG=github.com/mattboston/sms-gateway/internal/buildinfo && \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -ldflags="-s -w -X $PKG.Version=${VERSION} -X $PKG.Commit=${COMMIT}" \
    -o /out/sms-gateway ./cmd/sms-gateway

FROM debian:bookworm-slim AS runtime
WORKDIR /opt/sms-gateway

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=go-build /out/sms-gateway /usr/local/bin/sms-gateway

# Listen on every interface inside the container; which host interfaces reach
# it is decided by the published port (e.g. "127.0.0.1:5174:5174").
ENV HOST=0.0.0.0
EXPOSE 5174

ENTRYPOINT ["sms-gateway"]
CMD ["serve"]
