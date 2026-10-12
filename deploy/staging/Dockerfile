FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
ARG MORPHIUME_SOURCE_COMMIT
LABEL org.opencontainers.image.source="https://github.com/AmirMo10/Morphiume" \
      org.opencontainers.image.revision="${MORPHIUME_SOURCE_COMMIT}"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN npm install --global pnpm@11.25.0 \
    && groupadd --gid 1001 morphiume \
    && useradd --uid 1001 --gid 1001 --no-create-home morphiume
# Worker and migration run TypeScript via tsx; retain locked runtime dependencies.
# Do not prune dev dependencies until these processes are bundled and verified.
COPY --from=builder --chown=1001:1001 /app /app
USER 1001:1001
EXPOSE 3000
ENTRYPOINT ["node", "/app/deploy/staging/runtime.mjs"]
CMD ["pnpm", "start"]
