# Deployment

Production: **https://truckroute.siruyy.dev**. It runs on a Dokploy VPS behind Traefik and Cloudflare.

```
Cloudflare (proxied, SSL Full strict)
  → Traefik (Dokploy, Let's Encrypt)
    → web: nginx (SPA + /api proxy + /radar cache)   :8080
      → api: Django/uvicorn (2 workers)              :8000  (alias truckroute-api)
         → redis:7 (LRU, no persistence)
         → postgres:17 (volume pgdata: share snapshots)
```

## Pipeline

1. A push to `main` runs [`ci.yml`](../.github/workflows/ci.yml):
   - **Backend:** ruff, then pytest with coverage ≥ 85% enforced.
   - **Frontend:** oxlint, `tsc`, vitest, then a production build.
2. If those pass, two images are built and published to GHCR, tagged `latest` and with the commit SHA:
   - `ghcr.io/siruyy/spotter-truck-routing-api`
   - `ghcr.io/siruyy/spotter-truck-routing-web`

   Both images are public, so the VPS needs no registry credentials.
3. Run `deploy/redeploy.sh` to redeploy. It calls Dokploy's API (`compose.deploy`), and `pull_policy: always` makes Docker pull the new images. The script then waits until `/api/health` reports Redis and Postgres as healthy.
   - It needs `DOKPLOY_URL` and `DOKPLOY_API_KEY` in the environment.
   - Optional: set a `DOKPLOY_WEBHOOK_URL` repository secret, and CI calls it automatically. It is skipped while unset, because this Dokploy panel is only reachable over Tailscale.

## Dokploy setup (one time)

- **Project:** *Spotter Truck Routing* → compose `truckroute` (raw source). Its content is [`deploy/docker-compose.prod.yml`](../deploy/docker-compose.prod.yml).
- **Domain:** `truckroute.siruyy.dev` → service `web`, port `8080`, HTTPS with Let's Encrypt.
- **DNS:** Cloudflare proxied record `A truckroute → <VPS IP>`.
- **Environment** (stored in Dokploy, never in git):

| Variable | Notes |
|---|---|
| `TOMTOM_API_KEY` | Routing, Search, Geocoding and Reverse Geocoding enabled |
| `DJANGO_SECRET_KEY` | random, 50+ chars |
| `POSTGRES_PASSWORD` | random |
| `PUBLIC_HOST` | `truckroute.siruyy.dev` |
| `IMAGE_TAG` | `latest`, or a commit SHA to pin or roll back |
| `WEB_CONCURRENCY` | uvicorn workers (default 2) |

To roll back, set `IMAGE_TAG` to an earlier commit SHA in Dokploy and redeploy.

## Operational notes

- **Why the `truckroute-api` alias.** Dokploy joins `web` to its shared network so Traefik can reach it. Other projects on that network also have a service called `api`, so nginx proxies to the unique alias instead.
- **Healthchecks.** The API container checks `GET /api/health` on `127.0.0.1`, which is why that address is in `ALLOWED_HOSTS`. The web container checks `GET /`.
- **Free-tier guards.** `TOMTOM_DAILY_LIMIT` (2,000) and `OPENMETEO_DAILY_LIMIT` (9,000 locations) are counted in Redis per UTC day.
- **Logs.** Use Dokploy → *truckroute* → Logs, or `compose.readLogs` through the Dokploy API.
