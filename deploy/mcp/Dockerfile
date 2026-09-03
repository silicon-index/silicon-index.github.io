# syntax=docker/dockerfile:1
#
# mcp module API — container image for Coolify or any Docker host.
# Build from the REPOSITORY ROOT:
#   docker build -f deploy/mcp/Dockerfile -t silicon-index-mcp-api .
#
# Unlike database/ai/scrapers, this handler has one real npm dependency (the
# official MCP SDK), so there is an install step.
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production

# Only what the handler needs, so an unrelated change does not bust the layer.
COPY src/platform           ./src/platform
COPY src/modules            ./src/modules
COPY deploy/mcp/server.ts   ./deploy/mcp/server.ts

ENV PORT=8080
EXPOSE 8080

# Drop privileges — the base image ships a non-root `bun` user.
USER bun

# Uses the handler's own /health route, so the check exercises the real path.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "fetch('http://127.0.0.1:'+(Bun.env.PORT??'8080')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "deploy/mcp/server.ts"]
