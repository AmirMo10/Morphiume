#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true ]] || { echo 'CI-only image acceptance'; exit 1; }
image="ghcr.io/${GITHUB_REPOSITORY,,}:${GITHUB_SHA}"
common=(--network host --read-only --cap-drop ALL --security-opt no-new-privileges:true
  --env-file .local/image-env
  --mount "type=bind,src=$PWD/.local/image-runtime.json,dst=/runtime/config.json,readonly"
  --mount "type=bind,src=$PWD/.local/image-media,dst=/app/media"
  --tmpfs /tmp:rw,noexec,nosuid,size=64m,uid=1001,gid=1001,mode=0700
  --tmpfs /app/.next/cache:rw,noexec,nosuid,size=64m,uid=1001,gid=1001,mode=0700)
cleanup() {
  docker rm --force morphiume-ci-app morphiume-ci-worker >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker run --rm "${common[@]}" "$image" node --conditions=react-server /app/runtime/migrate.mjs
docker run --rm "${common[@]}" --env-file .local/image-seed-env "$image" node --conditions=react-server /app/runtime/seed.mjs
docker run --rm "${common[@]}" "$image" node --input-type=module -e '
  import {existsSync} from "node:fs";
  for (const path of ["/usr/local/bin/npm","/usr/local/bin/npx","/usr/local/bin/yarn","/usr/local/bin/pnpm","/app/node_modules/tsx","/app/node_modules/esbuild"]) {
    if(existsSync(path)) throw new Error("Build tool present in runtime: "+path);
  }
  console.log("Runtime has no package manager, TypeScript loader or build tool.");
'
docker run --detach --name morphiume-ci-app "${common[@]}" "$image" node /app/server.js >/dev/null
docker run --detach --name morphiume-ci-worker "${common[@]}" --env WORKER_HEARTBEAT_PATH=/tmp/worker-heartbeat "$image" node --conditions=react-server /app/runtime/worker.mjs >/dev/null
ready=false
for attempt in $(seq 1 45); do
  if curl --fail --silent http://localhost:3000/api/health/ready >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Built image readiness failed'; exit 1; }
pnpm test:e2e
docker exec morphiume-ci-worker node --input-type=module -e '
  import {readFileSync} from "node:fs";
  const tick=Date.parse(readFileSync("/tmp/worker-heartbeat","utf8"));
  if(!Number.isFinite(tick) || Date.now()-tick>45000) throw new Error("Worker heartbeat is stale");
  console.log("Bundled worker completed a recent database tick.");
'
docker stop --time 25 morphiume-ci-worker >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' morphiume-ci-worker)" == 0 ]] || { echo 'Worker graceful shutdown failed'; exit 1; }
echo 'Built image migration, seed, app, media/auth/browser flows and worker shutdown accepted.'
