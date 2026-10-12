FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
ARG MORPHIUME_SOURCE_COMMIT
LABEL org.opencontainers.image.source="https://github.com/AmirMo10/Morphiume" \
      org.opencontainers.image.revision="${MORPHIUME_SOURCE_COMMIT}"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Runtime commands use Node directly; package-manager transitive packages and
# build tools have no job here. Both stages use the same musl platform.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx \
    && addgroup -g 1001 morphiume \
    && adduser -D -H -u 1001 -G morphiume morphiume
COPY --from=builder --chown=1001:1001 /app/.next/standalone /app
COPY --from=builder --chown=1001:1001 /app/.next/static /app/.next/static
COPY --from=builder --chown=1001:1001 /app/public /app/public
COPY --from=builder --chown=1001:1001 /app/dist-runtime /app/runtime
COPY --from=builder --chown=1001:1001 /app/db/migrations /app/db/migrations
COPY --from=builder --chown=1001:1001 /app/deploy/staging/runtime.mjs /app/deploy/staging/runtime.mjs
USER 1001:1001
EXPOSE 3000
ENTRYPOINT ["node", "/app/deploy/staging/runtime.mjs"]
CMD ["node", "server.js"]
