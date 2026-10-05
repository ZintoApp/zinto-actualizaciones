import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { pool } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

export class MigrationSystem {
  private pool: Pool;
  private migrationsDir: string;

  constructor(pool: Pool, migrationsDir?: string) {
    this.pool = pool;
    this.migrationsDir = migrationsDir || path.join(process.cwd(), 'migrations');
  }

  async ensureMigrationsTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT NOW(),
          checksum VARCHAR(64) NOT NULL,
          execution_time_ms INTEGER,
          success BOOLEAN DEFAULT TRUE
        );
      `);

    } catch (error) {
      console.error('❌ Error creating migrations table:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getExecutedMigrations(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT filename FROM migrations WHERE success = TRUE ORDER BY executed_at'
      );
      return result.rows.map(row => row.filename);
    } catch (error) {
      console.error('❌ Error fetching executed migrations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getAvailableMigrations(): Promise<string[]> {
    try {
      if (!fs.existsSync(this.migrationsDir)) {

        fs.mkdirSync(this.migrationsDir, { recursive: true });
        return [];
      }

      const files = fs.readdirSync(this.migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      return files;
    } catch (error) {
      console.error('❌ Error reading migrations directory:', error);
      throw error;
    }
  }

  private async calculateChecksum(content: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Substitute environment variables in SQL content
   * Supports placeholders like ${ADMIN_EMAIL}, ${ADMIN_USERNAME}, etc.
   */
  private substituteEnvironmentVariables(content: string): string {
    try {
      const defaults = {
        ADMIN_EMAIL: 'admin@app.com',
        ADMIN_USERNAME: 'admin@app.com',
        ADMIN_FULL_NAME: 'Super Admin'
      };

      let processedContent = content;

      processedContent = processedContent.replace(/\$\{([A-Z_]+)\}/g, (match, varName) => {
        const value = process.env[varName] || defaults[varName as keyof typeof defaults];
        if (value === undefined) {
          console.warn(`⚠️  Environment variable ${varName} not found, keeping placeholder`);
          return match;
        }

        return value;
      });

      return processedContent;
    } catch (error) {
      console.error('❌ Error substituting environment variables:', error);
      return content;
    }
  }

  async executeMigration(filename: string): Promise<void> {
    const filePath = path.join(this.migrationsDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filename}`);
    }

    const rawContent = fs.readFileSync(filePath, 'utf8');
    const content = this.substituteEnvironmentVariables(rawContent);
    const checksum = await this.calculateChecksum(rawContent);
    const startTime = Date.now();

    const client = await this.pool.connect();

    try {


      await client.query('BEGIN');

      await client.query(content);

      const executionTime = Date.now() - startTime;
      await client.query(
        `INSERT INTO migrations (filename, checksum, execution_time_ms, success)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (filename) DO UPDATE SET
           checksum = EXCLUDED.checksum,
           execution_time_ms = EXCLUDED.execution_time_ms,
           success = TRUE,
           executed_at = NOW()`,
        [filename, checksum, executionTime]
      );

      await client.query('COMMIT');


    } catch (error) {
      await client.query('ROLLBACK');

      try {
        await client.query(
          `INSERT INTO migrations (filename, checksum, success)
           VALUES ($1, $2, FALSE)
           ON CONFLICT (filename) DO UPDATE SET
             checksum = EXCLUDED.checksum,
             success = FALSE,
             executed_at = NOW()`,
          [filename, checksum]
        );
      } catch (recordError) {
        console.error('❌ Error recording failed migration:', recordError);
      }

      console.error(`❌ Migration failed: ${filename}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runPendingMigrations(): Promise<void> {
    try {


      await this.ensureMigrationsTable();

      const executed = await this.getExecutedMigrations();
      const available = await this.getAvailableMigrations();

      const pending = available.filter(migration => !executed.includes(migration));

      if (pending.length === 0) {

        return;
      }


      pending.forEach(migration => console.log(`  - ${migration}`));

      for (const migration of pending) {
        await this.executeMigration(migration);
      }

      const { refreshPoolAfterMigrations } = await import('./db.js');
      await refreshPoolAfterMigrations();

    } catch (error) {
      console.error('❌ Migration process failed:', error);
      throw error;
    }
  }

  async validateMigrations(): Promise<boolean> {
    try {


      const executed = await this.getExecutedMigrations();
      const available = await this.getAvailableMigrations();

      const missingFiles = executed.filter(migration => !available.includes(migration));
      if (missingFiles.length > 0) {
        console.error('❌ Missing migration files:', missingFiles);
        return false;
      }

      const client = await this.pool.connect();
      try {
        for (const filename of executed) {
          const filePath = path.join(this.migrationsDir, filename);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const currentChecksum = await this.calculateChecksum(content);

            const result = await client.query(
              'SELECT checksum FROM migrations WHERE filename = $1 AND success = TRUE',
              [filename]
            );

            if (result.rows.length > 0) {
              const storedChecksum = result.rows[0].checksum;
              if (currentChecksum !== storedChecksum) {
                console.error(`❌ Checksum mismatch for migration: ${filename}`);
                return false;
              }
            }
          }
        }
      } finally {
        client.release();
      }


      return true;
    } catch (error) {
      console.error('❌ Error validating migrations:', error);
      return false;
    }
  }

  async getMigrationStatus(): Promise<{
    executed: string[];
    pending: string[];
    failed: string[];
  }> {
    const executed = await this.getExecutedMigrations();
    const available = await this.getAvailableMigrations();
    const pending = available.filter(migration => !executed.includes(migration));

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT filename FROM migrations WHERE success = FALSE ORDER BY executed_at'
      );
      const failed = result.rows.map(row => row.filename);

      return { executed, pending, failed };
    } finally {
      client.release();
    }
  }

  async createMigration(name: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] +
                     '-' + Date.now();
    const filename = `${timestamp}-${name.replace(/[^a-zA-Z0-9]/g, '-')}.sql`;
    const filePath = path.join(this.migrationsDir, filename);

    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content);


    return filename;
  }
}

export const migrationSystem = new MigrationSystem(
  pool,
  path.join(process.cwd(), 'migrations')
);
