# Use Node.js 22 with Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for TypeScript types)
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Install ts-node and typescript globally
RUN npm install --legacy-peer-deps -g ts-node typescript

# Copy source code (node_modules and cdn/ will be excluded via .dockerignore)
COPY . .

# Set default environment variables (can be overridden at runtime)
ENV PORT=3000
ENV MULTER_DIR=/app/cdn
ENV NODE_ENV=production
# Mark this as running inside Docker for process manager detection
ENV DOCKER_CONTAINER=true

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create the complete cdn directory structure and logs
RUN mkdir -p \
    /app/cdn/temp \
    /app/cdn/updates \
    /app/cdn/updates/archive \
    /app/cdn/instances/assets \
    /app/cdn/instances/packages \
    /app/cdn/instances/experience-archives \
    /app/cdn/instances/experience-folders \
    /app/assets/resources \
    /app/logs/state \
    /app/logs/crashes \
    /app/logs/shutdowns && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/cdn /app/logs

# Switch to non-root user
USER nodejs

# Expose the port
EXPOSE 3000

# Health check using wget (already included in Alpine)
# More aggressive health check for faster recovery
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:3000/health || exit 1

# Start the application
# Using exec form to ensure signals are properly forwarded
CMD ["npx", "ts-node", "server.ts"]