# Community MinIO is source-only. Build the selected releases instead of
# depending on an unpublished upstream container tag or a mutable local image.
FROM golang:1.24.8-bookworm@sha256:4ed690d6649d63c312b99a6120025ec79ce3b542968a37da53d6236c7c61a848 AS build
ENV GOTOOLCHAIN=local CGO_ENABLED=0 GOBIN=/out
RUN go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z
RUN go install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z
COPY ready.go /src/ready.go
RUN go build -trimpath -o /out/ready /src/ready.go
RUN go version -m /out/minio > /out/minio-build.txt \
    && go version -m /out/mc > /out/mc-build.txt \
    && mkdir -p /out/data /out/tmp/mc \
    && chmod 1777 /out/tmp

FROM scratch AS runtime
LABEL org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.version="RELEASE.2025-10-15T17-29-55Z"
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/minio /minio
COPY --from=build /out/mc /mc
COPY --from=build /out/ready /ready
COPY --from=build /out/minio-build.txt /out/mc-build.txt /build-info/
COPY --from=build --chown=10001:10001 /out/data /data
COPY --from=build --chown=10001:10001 /out/tmp /tmp
ENV HOME=/tmp MC_CONFIG_DIR=/tmp/mc
USER 10001:10001

FROM runtime AS server
ENTRYPOINT ["/minio"]
CMD ["server", "/data", "--console-address", ":9001"]

FROM runtime AS client
ENTRYPOINT ["/mc"]
