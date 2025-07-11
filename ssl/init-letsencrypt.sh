#!/bin/bash

# MAES Let's Encrypt Initialization Script
# This script sets up Let's Encrypt certificates for custom domains

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Configuration
DOMAIN=${DOMAIN:-""}
EMAIL=${EMAIL:-""}
USE_LETS_ENCRYPT=${USE_LETS_ENCRYPT:-false}
LETSENCRYPT_STAGING=${LETSENCRYPT_STAGING:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 MAES Let's Encrypt Initialization${NC}"
echo "=================================="

# Validation
if [ "$USE_LETS_ENCRYPT" != "true" ]; then
    echo -e "${YELLOW}⚠️  Let's Encrypt is disabled (USE_LETS_ENCRYPT=false)${NC}"
    echo "For custom domain with Let's Encrypt, set USE_LETS_ENCRYPT=true in .env"
    exit 0
fi

if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "localhost" ]; then
    echo -e "${RED}❌ Domain not configured or is localhost${NC}"
    echo "Please set DOMAIN in .env file (e.g., DOMAIN=maes.yourdomain.com)"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    echo -e "${RED}❌ Email not configured${NC}"
    echo "Please set EMAIL in .env file for Let's Encrypt registration"
    exit 1
fi

echo -e "${GREEN}📍 Domain: $DOMAIN${NC}"
echo -e "${GREEN}📧 Email: $EMAIL${NC}"
echo -e "${GREEN}🔒 Staging: $LETSENCRYPT_STAGING${NC}"

# Check if domain is accessible
echo ""
echo -e "${BLUE}🔍 Checking domain accessibility...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "http://$DOMAIN" | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ Domain is accessible${NC}"
else
    echo -e "${YELLOW}⚠️  Domain may not be properly configured${NC}"
    echo "Make sure your domain DNS points to this server"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if certificate already exists
if [ -d "certbot_certs/_data/live/$DOMAIN" ]; then
    echo -e "${YELLOW}⚠️  Certificate already exists for $DOMAIN${NC}"
    read -p "Regenerate certificate? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing certificate"
        exit 0
    fi
fi

# Create dummy certificate for initial nginx start
echo ""
echo -e "${BLUE}🔧 Creating dummy certificate for nginx startup...${NC}"
mkdir -p "certbot_certs/_data/live/$DOMAIN"
docker-compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout '/etc/letsencrypt/live/$DOMAIN/privkey.pem' \
    -out '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' \
    -subj '/CN=$DOMAIN'" certbot

# Start nginx with dummy certificate
echo ""
echo -e "${BLUE}🚀 Starting nginx with dummy certificate...${NC}"
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend

# Wait for nginx to be ready
echo "⏳ Waiting for nginx to be ready..."
sleep 10

# Remove dummy certificate
echo ""
echo -e "${BLUE}🗑️  Removing dummy certificate...${NC}"
docker-compose run --rm --entrypoint "\
    rm -rf /etc/letsencrypt/live/$DOMAIN && \
    rm -rf /etc/letsencrypt/archive/$DOMAIN && \
    rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# Request real certificate
echo ""
echo -e "${BLUE}🔒 Requesting Let's Encrypt certificate...${NC}"

STAGING_FLAG=""
if [ "$LETSENCRYPT_STAGING" = "true" ]; then
    STAGING_FLAG="--staging"
    echo -e "${YELLOW}📝 Using staging environment${NC}"
fi

docker-compose run --rm --entrypoint "\
    certbot certonly --webroot --webroot-path=/var/www/certbot \
    --email $EMAIL --agree-tos --no-eff-email \
    $STAGING_FLAG -d $DOMAIN" certbot

# Reload nginx with real certificate
echo ""
echo -e "${BLUE}🔄 Reloading nginx with real certificate...${NC}"
docker-compose exec frontend nginx -s reload

echo ""
echo -e "${GREEN}🎉 Let's Encrypt certificate successfully configured!${NC}"
echo -e "${GREEN}✅ Your site is now accessible at: https://$DOMAIN${NC}"

if [ "$LETSENCRYPT_STAGING" = "true" ]; then
    echo ""
    echo -e "${YELLOW}📝 Note: You used staging certificates. For production:${NC}"
    echo -e "${YELLOW}   1. Set LETSENCRYPT_STAGING=false in .env${NC}"
    echo -e "${YELLOW}   2. Run this script again${NC}"
fi

echo ""
echo -e "${BLUE}📋 Certificate will auto-renew every 12 hours${NC}"
echo -e "${BLUE}💡 Monitor logs with: docker-compose logs -f certbot${NC}"