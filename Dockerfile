FROM node:20-slim

WORKDIR /app

# Install system dependencies required for node-gyp and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    lsb-release \
    curl \
    gnupg \
    git \
    && ln -sf python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Install PostgreSQL client
RUN curl -sSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg > /dev/null \
    && echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Environment variables
ENV PGUSER=postgres
ENV PGPASSWORD=root
ENV PGHOST=postgres
ENV PGDATABASE=bothive
ENV APP_PORT=9000

# Build arguments
ARG ADMIN_EMAIL="admin@bothiveapp.net"
ARG COMPANY_NAME="BotHive"
ARG INSTANCE_NAME="default"

# Copy package files
COPY package*.json ./

# Install dependencies (now works because python + build tools exist)
RUN npm ci --include=optional

# Copy application source
COPY . .

# Fix optional dependency issue (rollup platform binary)
RUN npm install @rollup/rollup-linux-x64-gnu --save-optional

# Ensure build output exists
RUN if [ ! -d "dist" ]; then echo "ERROR: dist directory not found. Build the app first." && exit 1; fi

# Replace placeholders in built files
RUN find dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/admin@bothiveapp.net/${ADMIN_EMAIL}/g" {} \; && \
    find dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/BotHive/${COMPANY_NAME}/g" {} \; && \
    find client/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/admin@bothiveapp.net/${ADMIN_EMAIL}/g" {} \; 2>/dev/null || true && \
    find client/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/BotHive/${COMPANY_NAME}/g" {} \; 2>/dev/null || true

# Create runtime directories
RUN mkdir -p /app/data/uploads \
    /app/data/whatsapp-sessions \
    /app/data/backups \
    /app/volumes/backups \
    /app/temp/backups

# Copy entrypoint script
COPY docker-entrypoint-simple.sh /usr/local/bin/docker-entrypoint.sh

# Fix Windows line endings if they exist and make executable
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose application port
EXPOSE 9000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["node", "dist/index.js"]