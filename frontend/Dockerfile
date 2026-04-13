# Build stage
FROM node:24-alpine@sha256:01743339035a5c3c11a373cd7c83aeab6ed1457b55da6a69e014a95ac4e4700b AS builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend/ ./
COPY shared/ /shared/

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine@sha256:582c496ccf79d8aa6f8203a79d32aaf7ffd8b13362c60a701a2f9ac64886c93d

# Install required packages
RUN apk add --no-cache openssl gettext

# Create directories
RUN mkdir -p /etc/nginx/ssl /var/www/certbot

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx template and startup script
COPY frontend/nginx.conf.template /etc/nginx/nginx.conf.template
COPY frontend/nginx.conf /etc/nginx/nginx.conf.backup
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh

# Make entrypoint executable
RUN chmod +x /docker-entrypoint.sh && \
    chown -R nginx:nginx /etc/nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html /var/www/certbot

# Expose ports 80 and 443
EXPOSE 80 443

# Use custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
