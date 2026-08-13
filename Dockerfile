# Résumé builder service, packaged for an ordinary Myprod managed-app deployment.
#
# Two things drive the shape of this image:
#
#  1. The allocation is ephemeral, so the LaTeX support-file cache is baked in at
#     build time. A cold tectonic cache costs minutes of downloads, which would
#     otherwise be paid on every restart.
#  2. The block store is a git repository, so git is installed and the container
#     clones at startup rather than carrying state on disk.

# ---------- build the service ----------
FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/resumed ./cmd/resumed && \
    CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/resumekit ./cmd/resumekit

# ---------- fetch tectonic and warm its cache ----------
FROM debian:bookworm-slim AS tex
ARG TECTONIC_VERSION=0.17.0
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH}" in \
      arm64) TRIPLE=aarch64-unknown-linux-musl ;; \
      amd64) TRIPLE=x86_64-unknown-linux-musl ;; \
      *) echo "unsupported architecture ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${TRIPLE}.tar.gz"; \
    tar -xzf /tmp/tectonic.tar.gz -C /tmp; \
    install -m 0755 /tmp/tectonic /usr/local/bin/tectonic; \
    tectonic --version

# Compile the real document once so every package, font and map file this résumé
# needs is resolved and cached inside the image.
ENV XDG_CACHE_HOME=/var/cache/tectonic
COPY internal/render/templates/document.tmpl /warm/document.tmpl
RUN set -eux; \
    mkdir -p /warm /var/cache/tectonic; \
    sed 's|<< .Body >>|Warmup.|' /warm/document.tmpl > /warm/warm.tex; \
    cd /warm && tectonic -X compile warm.tex --outfmt pdf --print; \
    test -s /warm/warm.pdf; \
    du -sh /var/cache/tectonic

# ---------- runtime ----------
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git && rm -rf /var/lib/apt/lists/*

COPY --from=tex /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=tex /var/cache/tectonic /var/cache/tectonic
COPY --from=build /out/resumed /usr/local/bin/resumed
COPY --from=build /out/resumekit /usr/local/bin/resumekit
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 65532 matches the owner Myprod expects on the operator-installed secret file.
RUN groupadd --gid 65532 nonroot && \
    useradd --uid 65532 --gid 65532 --create-home --home-dir /home/nonroot nonroot && \
    mkdir -p /data && chown -R 65532:65532 /data /var/cache/tectonic

USER 65532:65532
ENV XDG_CACHE_HOME=/var/cache/tectonic \
    RESUMEKIT_ADDR=0.0.0.0:8080 \
    RESUMEKIT_REPO=/data/repo \
    RESUMEKIT_REPO_URL=https://github.com/blackdragoon26/muchBetterPortfolio.git \
    RESUMEKIT_REPO_BRANCH=main \
    HOME=/home/nonroot

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/resumed", "-healthcheck"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
