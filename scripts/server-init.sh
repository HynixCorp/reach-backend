#!/bin/bash
# ============================================
# Reach Backend - Server Initialization Script
# ============================================
# Run this script on a fresh server to set up
# all the required infrastructure for the backend.
#
# Usage: ./server-init.sh
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo "════════════════════════════════════════════════════════"
echo "       Reach Backend - Server Initialization"
echo "════════════════════════════════════════════════════════"
echo ""

# Configuration
APP_DIR="${APP_DIR:-/home/opc/apps/reach-backend}"
REGISTRY="${REGISTRY:-registry.reachsdk.online}"
IMAGE_NAME="${IMAGE_NAME:-reach-backend}"

# Check if running as appropriate user
if [ "$EUID" -eq 0 ]; then
    log_warn "Running as root. Consider using a non-root user."
fi

# Step 1: Check Docker installation
log_info "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    echo "  Run: curl -fsSL https://get.docker.com | sh"
    exit 1
fi
log_success "Docker is installed: $(docker --version)"

# Step 2: Check Docker Compose
log_info "Checking Docker Compose..."
if ! docker compose version &> /dev/null; then
    log_error "Docker Compose is not available."
    exit 1
fi
log_success "Docker Compose is available: $(docker compose version --short)"

# Step 3: Create application directory
log_info "Creating application directory..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"
log_success "Application directory: $APP_DIR"

# Step 4: Create Docker network
log_info "Creating Docker network 'frontend'..."
if docker network inspect frontend >/dev/null 2>&1; then
    log_success "Network 'frontend' already exists"
else
    docker network create frontend
    log_success "Network 'frontend' created"
fi

# Step 5: Create Docker volume for persistent data
log_info "Creating Docker volume 'reach-cdn-data'..."
if docker volume inspect reach-cdn-data >/dev/null 2>&1; then
    log_success "Volume 'reach-cdn-data' already exists"
else
    docker volume create reach-cdn-data
    log_success "Volume 'reach-cdn-data' created"
fi

# Step 6: Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
    log_info "Creating .env template..."
    cat > "$APP_DIR/.env" << 'EOF'
# Reach Backend Environment Variables
# Fill in the values below before starting the container

# Database
DB_URI=mongodb://user:password@host:27017/

# Security Keys
CRYPTO_SECRET=your-crypto-secret-here
CDN_SECRET_KEY=your-cdn-secret-here
UPDATE_SECRET=your-update-secret-here

# External Services
DASHBOARD_URL=https://dashboard.reachsdk.online
POLAR_API_KEY=
POLAR_WEBHOOK_SECRET=
POLAR_ENDPOINT_URI=https://api.polar.sh/v1
RESEND_API_KEY=
EOF
    log_warn ".env file created at $APP_DIR/.env"
    log_warn "Please edit this file with your actual configuration values!"
else
    log_success ".env file already exists"
fi

# Step 7: Create docker-compose.yml if it doesn't exist
if [ ! -f "$APP_DIR/docker-compose.yml" ]; then
    log_info "Creating docker-compose.yml..."
    cat > "$APP_DIR/docker-compose.yml" << 'EOF'
services:
  reach-backend:
    image: registry.reachsdk.online/reach-backend:latest
    container_name: reach-backend
    networks:
      - frontend
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - DB_URI=${DB_URI}
      - MULTER_DIR=/app/cdn
      - NODE_ENV=production
      - CRYPTO_SECRET=${CRYPTO_SECRET}
      - CDN_SECRET_KEY=${CDN_SECRET_KEY}
      - UPDATE_SECRET=${UPDATE_SECRET}
      - DASHBOARD_URL=${DASHBOARD_URL}
      - POLAR_API_KEY=${POLAR_API_KEY}
      - POLAR_WEBHOOK_SECRET=${POLAR_WEBHOOK_SECRET}
      - POLAR_ENDPOINT_URI=${POLAR_ENDPOINT_URI}
      - RESEND_API_KEY=${RESEND_API_KEY}
    labels:
      - traefik.enable=true
      - traefik.http.routers.reach-http.rule=Host(`devs.reachsdk.online`)
      - traefik.http.routers.reach-http.entrypoints=web
      - traefik.http.routers.reach-http.middlewares=redirect-to-https
      - traefik.http.routers.reach-https.rule=Host(`devs.reachsdk.online`)
      - traefik.http.routers.reach-https.entrypoints=websecure
      - traefik.http.routers.reach-https.tls=true
      - traefik.http.routers.reach-https.tls.certresolver=cloudflare
      - traefik.http.services.reach-backend.loadbalancer.server.port=3000
      - traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https
      - traefik.http.middlewares.redirect-to-https.redirectscheme.permanent=true
    volumes:
      - reach-cdn-data:/app/cdn
    restart: unless-stopped
    pull_policy: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/updates/v0/latest"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

volumes:
  reach-cdn-data:
    external: true

networks:
  frontend:
    external: true
EOF
    log_success "docker-compose.yml created"
else
    log_success "docker-compose.yml already exists"
fi

# Step 8: Create helper scripts
log_info "Creating helper scripts..."

# Start script
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose up -d
docker compose ps
EOF
chmod +x "$APP_DIR/start.sh"

# Stop script
cat > "$APP_DIR/stop.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose down
EOF
chmod +x "$APP_DIR/stop.sh"

# Logs script
cat > "$APP_DIR/logs.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose logs -f --tail=100
EOF
chmod +x "$APP_DIR/logs.sh"

# Update script
cat > "$APP_DIR/update.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "🔄 Pulling latest image..."
docker compose pull
echo "🔄 Restarting container..."
docker compose up -d
echo "🧹 Cleaning old images..."
docker image prune -f
echo "✅ Update complete!"
docker compose ps
EOF
chmod +x "$APP_DIR/update.sh"

# Backup CDN script
cat > "$APP_DIR/backup-cdn.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

echo "📦 Creating CDN backup..."
docker run --rm \
    -v reach-cdn-data:/source:ro \
    -v "$(pwd)/$BACKUP_DIR":/backup \
    alpine tar czf "/backup/cdn_backup_$TIMESTAMP.tar.gz" -C /source .

echo "✅ Backup created: $BACKUP_DIR/cdn_backup_$TIMESTAMP.tar.gz"
ls -lh "$BACKUP_DIR"
EOF
chmod +x "$APP_DIR/backup-cdn.sh"

log_success "Helper scripts created"

# Summary
echo ""
echo "════════════════════════════════════════════════════════"
echo "                 Setup Complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "📁 Application directory: $APP_DIR"
echo ""
echo "📋 Next steps:"
echo "   1. Edit .env file with your configuration:"
echo "      nano $APP_DIR/.env"
echo ""
echo "   2. Login to container registry:"
echo "      docker login $REGISTRY"
echo ""
echo "   3. Start the application:"
echo "      cd $APP_DIR && ./start.sh"
echo ""
echo "📜 Available helper scripts:"
echo "   ./start.sh      - Start the container"
echo "   ./stop.sh       - Stop the container"
echo "   ./logs.sh       - View container logs"
echo "   ./update.sh     - Pull and restart with latest image"
echo "   ./backup-cdn.sh - Backup CDN volume"
echo ""
echo "════════════════════════════════════════════════════════"
