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
# or clean start (removes lock files)
npm run dev:clean
```

---

## Process Management

The server includes a robust process manager that prevents infinite restart loops and zombie processes:

### Development Mode (`npm run dev`)
- Uses `ts-node-dev` for auto-restart on file changes
- Process manager monitors for crashes but lets `ts-node-dev` handle restarts
- Lock files prevent multiple instances

### Production Mode (Docker)
- Container exits on crash (Docker/Kubernetes handles restart)
- Maximum 5 restart attempts with backoff
- Lock files and port checks prevent conflicts
- Memory limits prevent overflow

### Troubleshooting

If the server fails to start:

```sh
# Clean lock files and crash state
npm run clean:locks

# Check port availability
netstat -tlnp | grep :3000

# View recent logs
tail -f logs/reach-$(date +%Y-%m-%d).log
```

Common issues:
- **"Port already in use"**: Another process is using the port, or stale lock file
- **"Lock file exists"**: Previous instance didn't shut down cleanly
- **"Max crashes exceeded"**: Server crashed repeatedly, manual intervention required

---

## Docker / Production

Before deploying, run the pre-deployment checklist:

```sh
npm run pre-deploy-check
```

This will verify:
- Environment variables are set
- TypeScript compilation succeeds
- Docker build works
- No stale lock files exist
- Working directory is clean

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

Process Manager (optional, sensible defaults):

- `MAX_CRASHES_BEFORE_EXIT=3` - Max crashes before requiring manual restart
- `CRASH_WINDOW_MS=60000` - Time window for crash counting (1 minute)
- `GRACEFUL_SHUTDOWN_TIMEOUT_MS=10000` - Shutdown timeout (10 seconds)

Logging (optional):

- `LOG_LEVEL=INFO` - Log level (DEBUG, INFO, WARN, ERROR, FATAL)
- `LOG_DIR=./logs` - Log directory
- `MAX_LOG_SIZE=10485760` - Max log file size (10MB)
- `MAX_LOG_FILES=30` - Max number of log files to keep

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