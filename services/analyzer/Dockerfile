FROM node:24-alpine@sha256:01743339035a5c3c11a373cd7c83aeab6ed1457b55da6a69e014a95ac4e4700b

# Install required packages
RUN apk add --no-cache ca-certificates dumb-init

# Set timezone
ENV TZ=UTC

# Install xsv for CSV processing (optional)
# RUN curl -L https://github.com/BurntSushi/xsv/releases/download/0.13.0/xsv-0.13.0-x86_64-unknown-linux-musl.tar.gz | \
#     tar xz -C /usr/local/bin/

# Install IPinfo CLI (optional)
# RUN curl -L https://github.com/ipinfo/cli/releases/download/ipinfo-3.3.1/ipinfo_3.3.1_linux_amd64.tar.gz | \
#     tar xz -C /usr/local/bin/

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY . .

# Create directories
RUN mkdir -p /input /output

# Create non-root user
RUN addgroup -g 1001 -S analyzer && \
    adduser -S analyzer -u 1001 -G analyzer

# Change ownership
RUN chown -R analyzer:analyzer /app /input /output

USER analyzer

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.request('http://127.0.0.1:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
