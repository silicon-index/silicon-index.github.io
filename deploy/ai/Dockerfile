# syntax=docker/dockerfile:1
#
# ai module API — container image for Coolify or any Docker host.
# Build from the REPOSITORY ROOT:
#   docker build -f deploy/ai/Dockerfile -t silicon-index-ai-api .
#
# The handler has no npm dependencies (relative imports and web APIs only),
# so there is no install step, no node_modules, and no build output to copy.
FROM oven/bun:1-alpine

WORKDIR /app

# Only what the handler needs, so an unrelated change does not bust the layer.
COPY src/lib/http.ts        ./src/lib/http.ts
COPY src/modules            ./src/modules
COPY deploy/ai/server.ts  ./deploy/ai/server.ts

ENV PORT=8080
EXPOSE 8080

# Drop privileges — the base image ships a non-root `bun` user.
USER bun

# Uses the handler's own /health route, so the check exercises the real path.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "fetch('http://127.0.0.1:'+(Bun.env.PORT??'8080')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "deploy/ai/server.ts"]
