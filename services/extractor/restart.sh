#!/bin/bash

# Restart script for MAES Extractor Service
# This script helps clear stuck jobs and restart the service

echo "Stopping extractor service..."
docker-compose stop extractor

echo "Clearing Redis queue..."
docker-compose exec redis redis-cli --raw FLUSHDB

echo "Starting extractor service..."
docker-compose up -d extractor

echo "Waiting for service to start..."
sleep 10

echo "Checking service status..."
docker-compose logs --tail=20 extractor

echo "Restart complete!" 