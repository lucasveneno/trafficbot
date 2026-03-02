# Stage 1: Build
FROM node:18-slim AS builder

WORKDIR /app

# Install dependencies for build
COPY package*.json ./
# Tell puppeteer to skip browser download during npm install in build stage
# because we will use the one provided by the base image or install it specifically
RUN PUPPETEER_SKIP_DOWNLOAD=true npm install

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM ghcr.io/puppeteer/puppeteer:latest AS runtime

WORKDIR /app

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/useragent ./useragent

# Install production dependencies only
RUN npm install --omit=dev

# Environment setup
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Healthcheck (Simplified)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('fs').existsSync('./dist/main.js') || process.exit(1)"

# Entrypoint
ENTRYPOINT ["node", "dist/main.js"]
