# MinIO no longer publishes images or binaries (Docker Hub and dl.min.io are
# gone), but the source is still tagged. The backup test needs an S3 server
# that really implements object lock and STS, so CI builds the last tagged
# release from source; buildx caches the layers, so only the first run pays.
FROM golang:1.25-alpine AS build
RUN apk add --no-cache git
ARG MINIO_TAG=RELEASE.2025-10-15T17-29-55Z
RUN git clone --depth 1 --branch "$MINIO_TAG" https://github.com/minio/minio /src
WORKDIR /src
RUN CGO_ENABLED=0 go build -trimpath -o /minio .

FROM alpine:3.22
COPY --from=build /minio /usr/bin/minio
ENTRYPOINT ["minio"]
