FROM node:20-alpine

# Install chromium dependencies for puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY src/ ./src/

# Create reports directory
RUN mkdir -p /app/reports

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S compliance -u 1001

# Change ownership of the app directory to the nodejs user
RUN chown -R compliance:nodejs /app
USER compliance

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
  const req = http.request('http://localhost:3002/health', (res) => { \
    if (res.statusCode === 200) process.exit(0); \
    else process.exit(1); \
  }); \
  req.on('error', () => process.exit(1)); \
  req.end();"

# Start the service
CMD ["npm", "start"]