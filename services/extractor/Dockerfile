FROM node:24-alpine

# Update package index and install required packages including OpenSSL and dependencies for PowerShell
RUN apk update && apk add --no-cache \
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
    pwsh -Command "Install-Module -Name AzureAD -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Az -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name Microsoft.Graph -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Install-Module -Name MSOnline -Force -AllowClobber -Scope AllUsers" && \
    pwsh -Command "Import-Module Microsoft-Extractor-Suite"

# Set timezone
ENV TZ=UTC

WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create output directory for certificates
RUN mkdir -p /output

# Generate a self-signed certificate and PFX, then output thumbprint
RUN openssl req -x509 -newkey rsa:2048 -nodes -keyout /output/app.key -out /output/app.crt \
    -subj "/CN=EXOAppCert" -days 365 && \
    openssl pkcs12 -export -out /output/app.pfx -inkey /output/app.key -in /output/app.crt -passout pass:Password123 && \
    echo "Certificate and PFX generated in /output (password: Password123)" && \
    echo "Thumbprint (SHA1): $(openssl x509 -in /output/app.crt -noout -fingerprint -sha1 | sed 's/^.*=//')"

# Create non-root user
RUN addgroup -g 1001 -S extractor && \
    adduser -S extractor -u 1001 -G extractor

# Change ownership of application and output directories
RUN chown -R extractor:extractor /app /output

USER extractor

CMD ["node", "src/index.js"]
