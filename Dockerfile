# Use Node.js 22 with Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for TypeScript types)
RUN npm ci && npm cache clean --force

# Install ts-node and typescript globally
RUN npm install -g ts-node typescript

# Copy source code (node_modules and files/ will be excluded via .dockerignore)
COPY . .

# Set default environment variables (can be overridden at runtime)
ENV PORT=3000
ENV MULTER_DIR=./files/uploads

# Create the files/uploads directory structure including temp
RUN mkdir -p files/uploads/temp

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory AFTER creating directories
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npx", "ts-node", "server.ts"]