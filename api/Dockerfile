FROM node:24-alpine@sha256:01743339035a5c3c11a373cd7c83aeab6ed1457b55da6a69e014a95ac4e4700b

# Install runtime and build dependencies
RUN apk add --no-cache dumb-init python3 make g++

WORKDIR /app

# Copy package files
COPY api/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY api/ ./
COPY shared/ /shared/

# Create runtime user and writable directories
RUN mkdir -p logs && \
    addgroup -S api && \
    adduser -S api -G api && \
    chown -R api:api /app

EXPOSE 3000

USER api

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.request('http://127.0.0.1:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
