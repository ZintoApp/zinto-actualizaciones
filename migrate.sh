for file in /www/wwwroot/default/migrations/*.sql; do
  echo "Running $file..."
  docker exec -i bothive-postgres psql -U postgres -d bothive < "$file"
done
