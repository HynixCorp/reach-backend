#!/bin/bash
# Reach Backend Pre-Deployment Checklist
# Run this script before deploying to production

set -e

echo "🔍 Reach Backend Pre-Deployment Checklist"
echo "═══════════════════════════════════════════"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check 1: Environment file exists
if [ -f ".env" ]; then
    check_pass "Environment file (.env) exists"
else
    check_fail "Environment file (.env) missing"
    echo "   Run: cp .env.example .env"
    exit 1
fi

# Check 2: Required environment variables
echo ""
echo "📋 Checking required environment variables..."

REQUIRED_VARS=(
    "DB_URI"
    "CRYPTO_SECRET"
    "CDN_SECRET_KEY"
    "UPDATE_SECRET"
    "BETTER_AUTH_SECRET"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${var}=" .env && ! grep -q "^${var}=" .env | grep -q "your-.*-here"; then
        check_pass "${var} is set"
    else
        check_fail "${var} is missing or placeholder"
        MISSING_VARS+=("${var}")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo ""
    echo "❌ Missing required environment variables. Please set them in .env"
    exit 1
fi

# Check 3: TypeScript compilation
echo ""
echo "🔨 Checking TypeScript compilation..."
if npm run typecheck > /dev/null 2>&1; then
    check_pass "TypeScript compilation successful"
else
    check_fail "TypeScript compilation failed"
    echo "   Run: npm run typecheck"
    exit 1
fi

# Check 4: Docker build
echo ""
echo "🐳 Testing Docker build..."
if docker build -t reach-backend:test . > /dev/null 2>&1; then
    check_pass "Docker build successful"
    # Clean up test image
    docker rmi reach-backend:test > /dev/null 2>&1 || true
else
    check_fail "Docker build failed"
    echo "   Try running: docker build -t reach-backend:test ."
    echo "   This might be due to network issues or missing dependencies"
    echo "   The deployment workflow will handle the actual build"
    # Don't exit - this is not critical for local development
fi

# Check 5: Lock files cleanup
echo ""
echo "🧹 Checking for stale lock files..."
LOCK_FILES=$(find logs/state -name "*.lock" -type f 2>/dev/null | wc -l)
CRASH_FILES=$(find logs/state -name "crash-state.json" -type f 2>/dev/null | wc -l)

if [ "$LOCK_FILES" -gt 0 ]; then
    check_warn "Found $LOCK_FILES stale lock file(s)"
    echo "   These will be cleaned up during deployment"
else
    check_pass "No stale lock files found"
fi

if [ "$CRASH_FILES" -gt 0 ]; then
    check_warn "Found $CRASH_FILES crash state file(s)"
    echo "   These will be cleaned up during deployment"
else
    check_pass "No crash state files found"
fi

# Check 6: Git status
echo ""
echo "📝 Checking git status..."
if [ -z "$(git status --porcelain)" ]; then
    check_pass "Working directory is clean"
else
    check_warn "Working directory has uncommitted changes"
    echo "   Consider committing or stashing changes"
fi

# Check 7: Current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    check_pass "On deployment branch: $CURRENT_BRANCH"
else
    check_warn "Not on main/master branch: $CURRENT_BRANCH"
    echo "   Deployment workflows only run on main/master"
fi

echo ""
echo "═══════════════════════════════════════════"
echo -e "${GREEN}🎉 Pre-deployment checklist complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Commit any remaining changes"
echo "2. Push to trigger deployment: git push origin $CURRENT_BRANCH"
echo "3. Monitor GitHub Actions for deployment status"
echo ""
echo "If deployment fails:"
echo "- Check GitHub Actions logs"
echo "- SSH to server and check: docker compose logs"
echo "- Use rollback script if needed: ./rollback.sh"