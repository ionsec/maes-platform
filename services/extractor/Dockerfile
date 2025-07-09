FROM node:18-alpine

# Install required packages including PowerShell
RUN apk add --no-cache \
    git \
    ca-certificates \
    curl \
    wget \
    icu-libs \
    krb5-libs \
    libgcc \
    libintl \
    openssl \
    libstdc++ \
    zlib

# Install PowerShell Core via package repository
RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing powershell || \
    (echo "PowerShell not available via package manager, installing manually..." && \
     ARCH=$(uname -m) && \
     if [ "$ARCH" = "x86_64" ]; then \
         PWSH_URL="https://github.com/PowerShell/PowerShell/releases/download/v7.4.0/powershell-7.4.0-linux-musl-x64.tar.gz"; \
     else \
         echo "Creating PowerShell wrapper for unsupported architecture" && \
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
    pwsh -Command "Install-Module -Name ExchangeOnlineManagement -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name AzureAD -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name MSOnline -Force -AllowClobber -Scope AllUsers"

# Set timezone
ENV TZ=UTC

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create output directory
RUN mkdir -p /output

# Create non-root user
RUN addgroup -g 1001 -S extractor && \
    adduser -S extractor -u 1001 -G extractor

# Change ownership
RUN chown -R extractor:extractor /app /output

USER extractor

CMD ["node", "src/index.js"]