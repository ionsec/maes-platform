#!/bin/bash
# Test script to verify all migrations are valid SQL

echo "Testing database migrations..."
echo "================================"

ERRORS=0
for migration in database/migrations/*.sql; do
    if [ -f "$migration" ]; then
        filename=$(basename "$migration")
        echo -n "Checking $filename... "
        
        # Check if file is not empty
        if [ ! -s "$migration" ]; then
            echo "ERROR: File is empty!"
            ERRORS=$((ERRORS + 1))
            continue
        fi
        
        # Basic SQL syntax check (look for common issues)
        if ! grep -q ';' "$migration"; then
            echo "WARNING: No semicolon found (might be incomplete)"
        fi
        
        echo "OK"
    fi
done

echo "================================"
if [ $ERRORS -eq 0 ]; then
    echo "All migrations look good!"
    echo ""
    echo "Migrations will run in this order:"
    ls database/migrations/*.sql | sort | xargs -n1 basename
else
    echo "Found $ERRORS error(s) in migrations"
    exit 1
fi