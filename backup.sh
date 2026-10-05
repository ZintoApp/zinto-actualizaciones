#!/bin/bash
set -e

# --------------------------------------------
# Docker Backup & Restore Tool
# Full: Volumes + DB + Images + Compose
# Tailored for bothive
# --------------------------------------------

BACKUP_DIR="./backup"
COMPOSE_FILE="docker-compose.yml"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"

# Postgres details
DB_NAME="bothive_db"
DB_USER="bothive"

# Docker volumes to backup
VOLUMES=(
  "bothive-postgres-data-bothive"
  "bothive-app-uploads-bothive"
  "bothive-app-public-bothive"
  "bothive-app-logs-bothive"
  "bothive-app-backups-bothive"
)

# Docker containers to save images
CONTAINERS=(
  "bothive-postgres-bothive"
  "bothive-app-bothive"
)

mkdir -p "$BACKUP_DIR"

show_menu() {
  clear
  echo "=============================="
  echo " Docker Backup & Restore Tool"
  echo "=============================="
  echo "1) Create Backup"
  echo "2) Restore Backup"
  echo "3) Exit"
  echo "------------------------------"
}

get_images() {
  IMAGES=()
  for c in "${CONTAINERS[@]}"; do
    if docker inspect "$c" >/dev/null 2>&1; then
      img=$(docker inspect "$c" -f '{{.Image}}')
      IMAGES+=("$img")
      echo "✔️ Found image: $img"
    else
      echo "⚠️ Container not found: $c (skipping image)"
    fi
  done
}

backup() {
  mkdir -p "$BACKUP_PATH"
  echo ""
  echo "➡️  Creating DB dump..."

  # Start Postgres temporarily for backup
  docker compose up -d "postgres-bothive"

  echo "⏳ Waiting for PostgreSQL to be ready..."
  POSTGRES_CONTAINER="bothive-postgres-bothive"
  until docker exec $POSTGRES_CONTAINER pg_isready -U $DB_USER -d $DB_NAME >/dev/null 2>&1; do
    sleep 2
  done

  docker exec $POSTGRES_CONTAINER pg_dump -U $DB_USER $DB_NAME > "$BACKUP_PATH/db_backup.sql"
  echo "✔️ Database backup saved as db_backup.sql"

  echo ""
  echo "➡️  Stopping containers..."
  docker compose down

  echo ""
  echo "➡️  Saving Docker images..."
  get_images
  for img in "${IMAGES[@]}"; do
    safe_img=$(echo "$img" | tr "/:" "_")
    docker save "$img" -o "$BACKUP_PATH/image_$safe_img.tar"
    echo "✔️ Image saved: $img"
  done

  echo ""
  echo "➡️  Backing up volumes..."
  mkdir -p "$BACKUP_PATH/volumes"
  for vol in "${VOLUMES[@]}"; do
    echo "   📦 Exporting $vol ..."
    docker run --rm -v "$vol:/source" -v "$BACKUP_PATH/volumes:/backup" alpine sh -c "tar czf /backup/$vol.tar.gz -C /source ."
  done

  echo ""
  echo "➡️  Copying compose + env..."
  cp "$COMPOSE_FILE" "$BACKUP_PATH/"
  [[ -f ".env" ]] && cp ".env" "$BACKUP_PATH/"

  echo ""
  echo "🎉 Backup completed successfully!"
  echo "📍 Backup location: $BACKUP_PATH"
}

restore() {
  echo ""
  echo "📂 Available backups:"
  select folder in $(ls -t "$BACKUP_DIR"); do
    RESTORE_PATH="$BACKUP_DIR/$folder"
    break
  done

  echo ""
  echo "➡️  Stopping containers..."
  docker compose down || true

  echo ""
  echo "➡️  Restoring volumes..."
  for archive in "$RESTORE_PATH/volumes"/*.tar.gz; do
    [ -e "$archive" ] || continue
    VOLUME_NAME=$(basename "$archive" .tar.gz)
    echo "   🔄 Restoring $VOLUME_NAME ..."
    docker volume rm -f "$VOLUME_NAME" >/dev/null 2>&1 || true
    docker volume create "$VOLUME_NAME" >/dev/null
    docker run --rm -v "$VOLUME_NAME:/restore" -v "$RESTORE_PATH/volumes:/backup" alpine sh -c "tar xzf /backup/$(basename "$archive") -C /restore"
  done

  echo ""
  echo "➡️  Restoring Docker images..."
  for file in "$RESTORE_PATH"/image_*.tar; do
    [ -e "$file" ] || continue
    docker load -i "$file"
    echo "✔️ Image loaded: $(basename "$file")"
  done

  echo ""
  echo "➡️  Restoring docker-compose + env..."
  cp "$RESTORE_PATH/docker-compose.yml" "$COMPOSE_FILE"
  [[ -f "$RESTORE_PATH/.env" ]] && cp "$RESTORE_PATH/.env" .env

  echo ""
  echo "➡️  Starting all services from restored compose..."
  docker compose up -d

  # Drop & recreate DB before restoring
  POSTGRES_CONTAINER="bothive-postgres-bothive"
  echo "⏳ Waiting for PostgreSQL to be fully ready..."
  until docker exec -i $POSTGRES_CONTAINER pg_isready -U $DB_USER -d $DB_NAME >/dev/null 2>&1; do
      sleep 2
  done

  echo "➡️ Dropping existing database (if exists)..."
  docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"

  echo "➡️ Creating fresh database..."
  docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"

  echo "➡️ Restoring database from backup..."
  docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME < "$RESTORE_PATH/db_backup.sql"
  echo "✔️ Database restored"

  echo ""
  echo "➡️ Starting full stack..."
  docker compose up -d --build

  echo ""
  echo "🎉 Restore completed successfully!"
}

while true; do
  show_menu
  read -p "Select an option: " OPTION
  case $OPTION in
    1) backup ;;
    2) restore ;;
    3) exit 0 ;;
    *) echo "Invalid option"; sleep 1 ;;
  esac
  read -p "Press Enter to continue..."
done
