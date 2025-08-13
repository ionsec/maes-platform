#!/bin/bash
set -e

# This script runs all SQL migrations in the migrations folder
# It's executed after the main init.sql by PostgreSQL's docker-entrypoint-initdb.d

echo "Starting database migrations..."

# Run all migration files in order
for migration in /docker-entrypoint-initdb.d/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Running migration: $(basename $migration)"
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$migration"
    fi
done

echo "Database migrations completed successfully"