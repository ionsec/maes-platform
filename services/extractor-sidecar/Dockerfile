FROM node:24-alpine@sha256:01743339035a5c3c11a373cd7c83aeab6ed1457b55da6a69e014a95ac4e4700b

# Install PowerShell Core and dependencies for Tier 3 Exchange-only extractions
RUN apk add --no-cache \
    ca-certificates \
    curl \
    dumb-init \
    icu-libs \
    krb5-libs \
    libgcc \
    libintl \
    openssl \
    libstdc++ \
    zlib

# Install PowerShell Core
RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing powershell || \
    (echo "PowerShell not available via package manager, installing manually..." && \
     ARCH=$(uname -m) && \
     if [ "$ARCH" = "x86_64" ]; then \
         PWSH_URL="https://github.com/PowerShell/PowerShell/releases/download/v7.4.0/powershell-7.4.0-linux-musl-x64.tar.gz"; \
     else \
         echo "Unsupported architecture $ARCH for PowerShell sidecar" && \
         exit 1; \
     fi && \
     curl -L $PWSH_URL -o /tmp/powershell.tar.gz && \
     mkdir -p /opt/microsoft/powershell/7 && \
     tar zxf /tmp/powershell.tar.gz -C /opt/microsoft/powershell/7 && \
     chmod +x /opt/microsoft/powershell/7/pwsh && \
     ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/pwsh && \
     rm /tmp/powershell.tar.gz)

# Install required PowerShell modules for Tier 3 extractions
RUN pwsh -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted" && \
    pwsh -Command "Install-Module -Name Microsoft-Extractor-Suite -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name ExchangeOnlineManagement -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Authentication -Force -AllowClobber -Scope AllUsers" && \
    echo "PowerShell modules installed successfully"

# Pre-import modules
RUN pwsh -Command "Import-Module Microsoft-Extractor-Suite -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Authentication -Force" && \
    echo "PowerShell modules pre-imported successfully"

ENV TZ=UTC

WORKDIR /app

# Copy sidecar application
COPY services/extractor-sidecar/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY services/extractor-sidecar/ ./
COPY shared/ /shared/

# Create output and cert directories
RUN mkdir -p /output /user_certificates /certs

# Generate default certificate
ARG CERT_PASSWORD
RUN CERT_PWD="${CERT_PASSWORD:-$(openssl rand -hex 32)}" && \
    openssl req -x509 -newkey rsa:2048 -nodes -keyout /output/app.key -out /output/app.crt \
    -subj "/CN=EXOAppCert" -days 365 && \
    openssl pkcs12 -export -out /output/app.pfx -inkey /output/app.key -in /output/app.crt -passout pass:"$CERT_PWD" && \
    echo "$CERT_PWD" > /output/cert_password.txt

RUN addgroup -g 1002 -S sidecar && \
    adduser -S sidecar -u 1002 -G sidecar && \
    chown -R sidecar:sidecar /app /output /user_certificates /certs

USER sidecar

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.request('http://127.0.0.1:3001/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]