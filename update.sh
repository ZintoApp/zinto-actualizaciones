#!/bin/bash
# File: update_all_instances.sh
# Path: /www/wwwroot/bothiveplus/share/update_all_instances.sh

BASE_DIR="/www/wwwroot/bothiveplus/share/instances"

echo "🚀 Starting update for all Docker instances..."

# Loop through each directory inside instances
for dir in "$BASE_DIR"/*; do
    if [ -d "$dir" ]; then
        echo ""
        echo "--------------------------------------------"
        echo "📦 Updating instance: $(basename "$dir")"
        echo "--------------------------------------------"
        cd "$dir" || continue
        
        # Check if docker-compose.yml exists before running
        if [ -f "docker-compose.yml" ]; then
            docker compose up -d --build
            echo "✅ Updated: $(basename "$dir")"
        else
            echo "⚠️  Skipped $(basename "$dir") — no docker-compose.yml found."
        fi
    fi
done

echo ""
echo "🎉 All instances processed!"
