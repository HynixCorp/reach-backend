# reach-backend
Backend service for https://api.reachsdk.online/


## Quick start

1. Clone the repository and install dependencies:

```sh
git clone <repo-url>
cd reach-backend
npm ci
```

2. Copy `.env.sample` to `.env` and fill in required values (see **Environment Variables** below):

```sh
cp .env.sample .env
# Edit .env with secure values
```

3. Run the server locally:

```sh
npx ts-node server.ts
# or for development with auto-reload
npm run dev
```

---

## Docker / Production

Build the Docker image locally:

```sh
docker build -t reach-backend:local .
```

Run with Docker (example):

```sh
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e DB_URI="mongodb://admin:password@db-host:27017/" \
  -e MULTER_DIR="/app/cdn" \
  -v $(pwd)/cdn:/app/cdn \
  reach-backend:local
```

Or use the provided `docker-compose-with-traefik.yaml` (recommended for production). The GitHub Actions workflow builds and deploys to your target host when pushing to `main`.

---

## Environment Variables (required for production)

Critical (server will warn / partially fail if missing):

- `DB_URI` - MongoDB connection string
- `CRYPTO_SECRET` - Crypto secret key
- `CDN_SECRET_KEY` - Secret that signs CDN requests
- `UPDATE_SECRET` - Tauri update secret
- `BETTER_AUTH_SECRET` - Better-Auth secret for sessions and encryption

Optional (enable features):

- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` - Microsoft/Xbox OAuth (player auth)
- `POLAR_API_KEY`, `POLAR_WEBHOOK_SECRET`, `POLAR_ENDPOINT_URI` - Payments (Polar)
- `RESEND_API_KEY` - Email delivery (Resend)
- `DASHBOARD_URL` - Dashboard trusted origin

Secrets required by CI / Deployment (set in GitHub Actions secrets):

- `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, `OCI_HOST`, `OCI_SSH_USER`, `OCI_SSH_KEY`

> Tip: generate cryptographically secure secrets: `openssl rand -hex 32`

---

## Health checks & readiness

- The server exposes `/health` for container health checks.
- The Dockerfile contains a HEALTHCHECK that calls this endpoint.

---

## Permissions

Ensure the CDN directory is writable by the container user. Example:

```sh
mkdir -p cdn/temp cdn/updates cdn/instances/assets cdn/instances/packages
chmod -R 755 cdn
``` 

---

## Notes

- Marketplace `GET /api/marketplace/v0/manifest/get` is a TODO but the route is present. `GET /api/marketplace/v0/items/all` works.
- Player OAuth will not work unless Microsoft credentials are configured; the server will still start but log a warning.

If you want, I can add a checklist to the README or include a deployment checklist script. 