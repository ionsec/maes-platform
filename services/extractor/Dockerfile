FROM node:24-alpine@sha256:01743339035a5c3c11a373cd7c83aeab6ed1457b55da6a69e014a95ac4e4700b

# Install required packages including OpenSSL and dependencies for PowerShell
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

# Install PowerShell Core via package repository or manual
RUN apk add --no-cache --repository=https://dl-cdn-alpinelinux.org/alpine/edge/testing powershell || \
    (echo "PowerShell not available via package manager, installing manually..." && \
     ARCH=$(uname -m) && \
     if [ "$ARCH" = "x86_64" ]; then \
         PWSH_URL="https://github.com/PowerShell/PowerShell/releases/download/v7.4.0/powershell-7.4.0-linux-musl-x64.tar.gz"; \
     else \
         echo "Unsupported architecture $ARCH, creating dummy pwsh wrapper" && \
         mkdir -p /usr/bin && \
         echo '#!/bin/sh' > /usr/bin/pwsh && \
         echo 'echo "PowerShell not available for this architecture. Using bash instead."' >> /usr/bin/pwsh && \
         echo 'exec bash -c "$@"' >> /usr/bin/pwsh && \
         chmod +x /usr/bin/pwsh && \
         exit 0; \
     fi && \
     curl -L $PWSH_URL -o /tmp/powershell.tar.gz && \
     mkdir -p /opt/microsoft/powershell/7 && \
     tar zxf /tmp/powershell.tar.gz -C /opt/microsoft/powershell/7 && \
     chmod +x /opt/microsoft/powershell/7/pwsh && \
     ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/pwsh && \
     rm /tmp/powershell.tar.gz)

# Install Microsoft 365 PowerShell modules globally
RUN pwsh -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted" && \
    pwsh -Command "Install-Module -Name Microsoft-Extractor-Suite -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name ExchangeOnlineManagement -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Az -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Authentication -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Users -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Groups -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Identity.SignIns -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Identity.Governance -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.DeviceManagement -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Identity.DirectoryManagement -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph.Security -Force -AllowClobber -Scope AllUsers"

# Pre-import frequently used modules to reduce runtime loading time
RUN pwsh -Command "Import-Module Microsoft-Extractor-Suite -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Authentication -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Users -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Groups -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Identity.SignIns -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Identity.Governance -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.DeviceManagement -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Identity.DirectoryManagement -Force" && \
    pwsh -Command "Import-Module Microsoft.Graph.Security -Force" && \
    echo "PowerShell modules pre-imported successfully"

# Set timezone
ENV TZ=UTC

WORKDIR /app

# Copy package files and install Node.js dependencies
COPY services/extractor/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY services/extractor/ ./
COPY shared/ /shared/

# Create output directory for certificates
RUN mkdir -p /output

# Generate a self-signed certificate and PFX, then output thumbprint
ARG CERT_PASSWORD
RUN CERT_PWD="${CERT_PASSWORD:-$(openssl rand -hex 32)}" && \
    openssl req -x509 -newkey rsa:2048 -nodes -keyout /output/app.key -out /output/app.crt \
    -subj "/CN=EXOAppCert" -days 365 && \
    openssl pkcs12 -export -out /output/app.pfx -inkey /output/app.key -in /output/app.crt -passout pass:"$CERT_PWD" && \
    echo "Certificate and PFX generated in /output" && \
    echo "Thumbprint (SHA1): $(openssl x509 -in /output/app.crt -noout -fingerprint -sha1 | sed 's/^.*=//')" && \
    echo "$CERT_PWD" > /output/cert_password.txt

# Create non-root user
RUN addgroup -g 1001 -S extractor && \
    adduser -S extractor -u 1001 -G extractor

# Change ownership of application and output directories
RUN chown -R extractor:extractor /app /output

USER extractor

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.request('http://127.0.0.1:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
