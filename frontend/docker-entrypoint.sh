#!/bin/sh

# MAES Frontend Docker Entrypoint
# Handles SSL certificate management and nginx configuration

set -e

# Default values
DOMAIN=${DOMAIN:-localhost}
USE_LETS_ENCRYPT=${USE_LETS_ENCRYPT:-false}
LETSENCRYPT_STAGING=${LETSENCRYPT_STAGING:-false}

echo "🚀 Starting MAES Frontend..."
echo "📍 Domain: $DOMAIN"
echo "🔒 Use Let's Encrypt: $USE_LETS_ENCRYPT"

# Function to generate self-signed certificate
generate_self_signed() {
    local domain=$1
    echo "🔧 Generating self-signed certificate for $domain..."
    
    openssl req -x509 -newkey rsa:4096 \
        -keyout /etc/nginx/ssl/key.pem \
        -out /etc/nginx/ssl/cert.pem \
        -days 365 -nodes \
        -subj "/C=US/ST=State/L=City/O=MAES/OU=Security/CN=$domain"
    
    echo "✅ Self-signed certificate generated"
}

# Function to wait for Let's Encrypt certificate
wait_for_letsencrypt() {
    local domain=$1
    local max_attempts=30
    local attempt=1
    
    echo "⏳ Waiting for Let's Encrypt certificate for $domain..."
    
    while [ $attempt -le $max_attempts ]; do
        if [ -f "/etc/letsencrypt/live/$domain/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/$domain/privkey.pem" ]; then
            echo "✅ Let's Encrypt certificate found"
            return 0
        fi
        
        echo "   Attempt $attempt/$max_attempts - waiting for certificate..."
        sleep 10
        attempt=$((attempt + 1))
    done
    
    echo "⚠️  Let's Encrypt certificate not found after $max_attempts attempts"
    return 1
}

# Set SSL certificate paths
if [ "$USE_LETS_ENCRYPT" = "true" ] && [ "$DOMAIN" != "localhost" ]; then
    # Try to use Let's Encrypt certificate
    if wait_for_letsencrypt "$DOMAIN"; then
        SSL_CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
        SSL_KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
        
        # Enable OCSP stapling for Let's Encrypt
        OCSP_STAPLING="ssl_stapling on; ssl_stapling_verify on; ssl_trusted_certificate /etc/letsencrypt/live/$DOMAIN/chain.pem;"
        echo "🔒 Using Let's Encrypt certificate"
    else
        echo "⚠️  Falling back to self-signed certificate"
        generate_self_signed "$DOMAIN"
        SSL_CERT_PATH="/etc/nginx/ssl/cert.pem"
        SSL_KEY_PATH="/etc/nginx/ssl/key.pem"
        OCSP_STAPLING=""
    fi
else
    # Use self-signed certificate
    generate_self_signed "$DOMAIN"
    SSL_CERT_PATH="/etc/nginx/ssl/cert.pem"
    SSL_KEY_PATH="/etc/nginx/ssl/key.pem"
    OCSP_STAPLING=""
fi

# Set HSTS header (only for custom domains)
if [ "$DOMAIN" != "localhost" ]; then
    HSTS_HEADER='add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;'
else
    HSTS_HEADER=""
fi

# Generate nginx configuration from template
echo "🔧 Generating nginx configuration..."
export DOMAIN SSL_CERT_PATH SSL_KEY_PATH OCSP_STAPLING HSTS_HEADER

envsubst '${DOMAIN} ${SSL_CERT_PATH} ${SSL_KEY_PATH} ${OCSP_STAPLING} ${HSTS_HEADER}' \
    < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Validate nginx configuration
echo "🔍 Validating nginx configuration..."
if nginx -t; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration is invalid, falling back to backup"
    cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf
fi

echo "🎯 MAES Frontend ready!"
echo "   Domain: $DOMAIN"
echo "   SSL Certificate: $SSL_CERT_PATH"
echo "   SSL Key: $SSL_KEY_PATH"

# Execute the main command
exec "$@"