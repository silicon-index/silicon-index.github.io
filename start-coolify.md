# Resuming Coolify

Coolify was installed on this machine as an optional, self-hosted VPS-deployment
alternative alongside the primary Cloudflare Worker + D1 admin backend (see
[`worker/README.md`](./worker/README.md)). It's not needed day-to-day, so it was
stopped and its data moved out of the way. This is how to bring it back.

## Current state

- All Coolify containers (dashboard, Postgres, Redis, realtime, sentinel) and the
  auto-provisioned onboarding demo app were **stopped and removed** (not just
  paused) — `docker ps -a` won't show them anymore.
- The Postgres/Redis **data volumes** (`coolify-db`, `coolify-redis`) were left
  intact in Docker's own storage — nothing in them was deleted.
- Coolify's config directory (env secrets, SSH key, source, application/proxy
  definitions) was moved from `/data/coolify` to **`/root/backups/coolify`**.
- The Docker daemon itself was stopped (`systemctl stop docker.socket
  docker.service`).

## Bring it back

```bash
# 1. Restore the data directory to where Coolify expects it
mv /root/backups/coolify /data/coolify

# 2. Start the Docker daemon
systemctl start docker

# 3. Bring the core Coolify stack back up (dashboard, Postgres, Redis, realtime)
cd /data/coolify/source
docker compose -f docker-compose.yml -f docker-compose.prod.yml -p source up -d

# 4. Confirm everything is healthy
docker ps
```

Coolify should then be reachable the same way it was before:

- `http://<this-machine's-LAN-IP>:8000`

## What won't come back automatically

The **sentinel** container and the **onboarding demo app** (`my-first-project` /
`silicon-indexgithubiodev`) were removed, not just stopped — they have no
compose-managed restart path outside Coolify's own orchestration. After step 3
above:

- Sentinel: Coolify normally manages this itself once the dashboard is back up;
  give it a minute, or redeploy it from the Coolify UI if it doesn't reappear.
- Demo app: it was just an onboarding placeholder — safe to ignore, or recreate
  a fresh "Hello World" deployment from the Coolify UI if you want it back.

## If you want to stop it again later

```bash
cd /data/coolify/source
docker compose -f docker-compose.yml -f docker-compose.prod.yml -p source down
mv /data/coolify /root/backups/coolify
systemctl stop docker.socket docker.service
```

## Notes

- `/root/backups/coolify/source/.env` holds generated secrets (DB password, app
  key, Pusher credentials, etc.). Treat it like any other credentials file — the
  Coolify installer's own warning says to back it up somewhere outside this
  machine.
- Ports Coolify uses by default: `8000` (dashboard), `6001`-`6002` (realtime),
  plus `80`/`443` if/when the Traefik proxy is fronting deployed apps.
