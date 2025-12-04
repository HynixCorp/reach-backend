# Use Node.js 22 with Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install required system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

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

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create the complete cdn directory structure
RUN mkdir -p \
    /app/cdn/temp \
    /app/cdn/updates \
    /app/cdn/updates/archive \
    /app/cdn/instances/assets \
    /app/cdn/instances/packages \
    /app/cdn/instances/experience-archives \
    /app/cdn/instances/experience-folders \
    /app/assets/resources && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/cdn

# Switch to non-root user
USER nodejs

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/updates/v0/latest || exit 1

# Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npx", "ts-node", "server.ts"]