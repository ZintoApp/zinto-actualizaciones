import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import * as tar from 'tar';
import fetch from 'node-fetch';
import { storage } from '../storage';
import { migrationSystem } from '../migration-system';
import { logger } from '../utils/logger';
import { SystemUpdate, UpdateStatus } from '@shared/schema';

interface UpdatePackage {
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  packageHash: string;
  packageSize: number;
  migrationScripts: string[];
  requiredVersion?: string;
}

interface UpdateProgress {
  updateId: number;
  status: UpdateStatus;
  progress: number;
  message: string;
  error?: string;
}

/**
 * Auto-Update Service
 * Handles checking, downloading, validating, and applying system updates
 */
export class AutoUpdateService extends EventEmitter {
  private static instance: AutoUpdateService;
  private updateInProgress = false;
  private currentUpdate: SystemUpdate | null = null;
  private readonly isDockerEnvironment: boolean;
  private readonly updateDir: string;
  private readonly backupDir: string;
  private readonly releaseApiUrl = 'https://releases.bothiveapp.net/updates';

  constructor() {
    super();

    this.isDockerEnvironment = this.detectDockerEnvironment();

    this.updateDir = this.isDockerEnvironment
      ? '/app/volumes/updates'
      : path.join(process.cwd(), 'updates');

    this.backupDir = this.isDockerEnvironment
      ? '/app/volumes/backups/updates'
      : path.join(process.cwd(), 'backups', 'updates');

    logger.info('auto-update', `Auto-update service initialized. Docker: ${this.isDockerEnvironment}`);
    logger.info('auto-update', `Update directory: ${this.updateDir}`);
    logger.info('auto-update', `Backup directory: ${this.backupDir}`);

    this.ensureDirectories();
  }

  static getInstance(): AutoUpdateService {
    if (!AutoUpdateService.instance) {
      AutoUpdateService.instance = new AutoUpdateService();
    }
    return AutoUpdateService.instance;
  }

  /**
   * Detect if running in Docker environment
   */
  private detectDockerEnvironment(): boolean {
    if (process.env.DOCKER_CONTAINER === 'true') {
      return true;
    }

    try {
      return fs.existsSync('/.dockerenv');
    } catch {
      return false;
    }
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.updateDir);
    await fs.ensureDir(this.backupDir);
  }

  /**
   * Get current application version from package.json
   */
  async getCurrentVersion(): Promise<string> {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageJson = await fs.readJson(packagePath);
      return packageJson.version || '2.0.0';
    } catch (error) {
      logger.error('auto-update', 'Failed to read current version', error);
      return '2.0.0';
    }
  }

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<UpdatePackage | null> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const response = await fetch(`${this.releaseApiUrl}/v${currentVersion}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          logger.info('auto-update', 'No updates available');
          return null;
        }
        throw new Error(`Update check failed: ${response.statusText}`);
      }

      const updateInfo = await response.json() as UpdatePackage;
      
      if (!this.validateUpdatePackage(updateInfo)) {
        throw new Error('Invalid update package structure');
      }

      logger.info('auto-update', `Update available: ${updateInfo.version}`);
      return updateInfo;
    } catch (error) {
      logger.error('auto-update', 'Failed to check for updates', error);
      throw error;
    }
  }

  /**
   * Validate update package structure
   */
  private validateUpdatePackage(pkg: any): pkg is UpdatePackage {
    return (
      typeof pkg.version === 'string' &&
      typeof pkg.downloadUrl === 'string' &&
      typeof pkg.packageHash === 'string' &&
      typeof pkg.packageSize === 'number' &&
      Array.isArray(pkg.migrationScripts)
    );
  }

  /**
   * Download and validate update package
   */
  async downloadUpdate(updatePackage: UpdatePackage): Promise<string> {
    const updateRecord = await storage.createSystemUpdate({
      version: updatePackage.version,
      releaseNotes: updatePackage.releaseNotes || '',
      downloadUrl: updatePackage.downloadUrl,
      packageHash: updatePackage.packageHash,
      packageSize: updatePackage.packageSize,
      status: 'downloading',
      migrationScripts: JSON.stringify(updatePackage.migrationScripts),
      startedAt: new Date()
    });

    this.currentUpdate = updateRecord;
    this.emitProgress(updateRecord.id, 'downloading', 0, 'Starting download...');

    try {
      const packagePath = path.join(this.updateDir, `update-${updatePackage.version}.tar.gz`);
      
      const response = await fetch(updatePackage.downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const totalSize = updatePackage.packageSize;
      let downloadedSize = 0;

      const fileStream = fs.createWriteStream(packagePath);
      const hash = crypto.createHash('sha256');

      return new Promise((resolve, reject) => {
        response.body?.on('data', (chunk) => {
          downloadedSize += chunk.length;
          hash.update(chunk);
          fileStream.write(chunk);
          
          const progress = Math.round((downloadedSize / totalSize) * 50);
          this.emitProgress(updateRecord.id, 'downloading', progress, `Downloaded ${downloadedSize}/${totalSize} bytes`);
        });

        response.body?.on('end', async () => {
          fileStream.end();
          
          const calculatedHash = hash.digest('hex');
          if (calculatedHash !== updatePackage.packageHash) {
            await this.updateStatus(updateRecord.id, 'failed', 'Package hash validation failed');
            reject(new Error('Package hash validation failed'));
            return;
          }

          await this.updateStatus(updateRecord.id, 'validating', 'Package downloaded and validated');
          this.emitProgress(updateRecord.id, 'validating', 60, 'Package validated successfully');
          resolve(packagePath);
        });

        response.body?.on('error', async (error) => {
          await this.updateStatus(updateRecord.id, 'failed', error.message);
          reject(error);
        });
      });
    } catch (error) {
      await this.updateStatus(updateRecord.id, 'failed', error instanceof Error ? error.message : 'Download failed');
      throw error;
    }
  }

  /**
   * Apply system update
   */
  async applyUpdate(packagePath: string): Promise<void> {
    if (!this.currentUpdate) {
      throw new Error('No current update in progress');
    }

    this.updateInProgress = true;
    
    try {

      
      const backupPath = await this.createBackup();
      await this.updateStatus(this.currentUpdate.id, 'applying', 'Backup created', { backupPath });
      this.emitProgress(this.currentUpdate.id, 'applying', 70, 'Backup created');

      const extractPath = path.join(this.updateDir, `extract-${this.currentUpdate.version}`);
      await fs.ensureDir(extractPath);
      await tar.extract({ file: packagePath, cwd: extractPath });
      this.emitProgress(this.currentUpdate.id, 'applying', 80, 'Package extracted');

      await this.applyMigrations(extractPath);
      this.emitProgress(this.currentUpdate.id, 'applying', 90, 'Database migrations applied');

      await this.applyCodeUpdates(extractPath);
      this.emitProgress(this.currentUpdate.id, 'applying', 95, 'Code updates applied');

      await this.updatePackageVersion(this.currentUpdate.version);

      await this.updateStatus(this.currentUpdate.id, 'completed', 'Update completed successfully');
      this.emitProgress(this.currentUpdate.id, 'completed', 100, 'Update completed successfully');



      logger.info('auto-update', `Update to version ${this.currentUpdate.version} completed successfully`);

      await this.restartApplication();
    } catch (error) {
      logger.error('auto-update', 'Update failed', error);
      await this.rollbackUpdate();
      throw error;
    } finally {
      this.updateInProgress = false;
      this.currentUpdate = null;
    }
  }

  /**
   * Create system backup before update
   */
  private async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `backup-${timestamp}.tar.gz`);
    
    const filesToBackup = [
      'package.json',
      'client/dist',
      'migrations',
      'uploads'
    ];

    await tar.create(
      {
        gzip: true,
        file: backupPath,
        cwd: process.cwd()
      },
      filesToBackup.filter(file => fs.existsSync(path.join(process.cwd(), file)))
    );

    const dbBackupPath = await storage.createDatabaseBackup(`update-backup-${timestamp}`);

    const backupMetadata = {
      timestamp,
      applicationBackup: backupPath,
      databaseBackup: dbBackupPath,
      version: this.currentUpdate?.version
    };

    await fs.writeFile(
      path.join(this.backupDir, `backup-${timestamp}.json`),
      JSON.stringify(backupMetadata, null, 2)
    );

    return backupPath;
  }

  /**
   * Apply database migrations from update package
   */
  private async applyMigrations(extractPath: string): Promise<void> {
    const migrationsPath = path.join(extractPath, 'migrations');

    if (await fs.pathExists(migrationsPath)) {
      const targetMigrationsDir = path.join(process.cwd(), 'migrations');
      await fs.ensureDir(targetMigrationsDir);

      const migrationFiles = await fs.readdir(migrationsPath);
      for (const file of migrationFiles) {
        if (file.endsWith('.sql')) {
          await fs.copy(
            path.join(migrationsPath, file),
            path.join(targetMigrationsDir, file),
            { overwrite: true }
          );
        }
      }

      await migrationSystem.runPendingMigrations();
    }
  }

  /**
   * Apply code updates from package
   */
  private async applyCodeUpdates(extractPath: string): Promise<void> {
    const codePaths = ['server', 'client', 'shared'];

    for (const codePath of codePaths) {
      const sourcePath = path.join(extractPath, codePath);

      const targetPath = this.isDockerEnvironment
        ? path.join('/app/volumes/app-updates', codePath)
        : path.join(process.cwd(), codePath);

      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(path.dirname(targetPath));

        if (this.isDockerEnvironment) {
          await fs.copy(sourcePath, targetPath, { overwrite: true });
          logger.info('auto-update', `Staged ${codePath} updates in volume`);
        } else {
          await fs.copy(sourcePath, targetPath, { overwrite: true });
          logger.info('auto-update', `Updated ${codePath}`);
        }
      }
    }
  }

  /**
   * Update package.json version
   */
  private async updatePackageVersion(version: string): Promise<void> {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = await fs.readJson(packagePath);
    packageJson.version = version;
    await fs.writeJson(packagePath, packageJson, { spaces: 2 });
  }

  /**
   * Rollback failed update
   */
  private async rollbackUpdate(): Promise<void> {
    if (!this.currentUpdate) return;

    try {
      await this.updateStatus(this.currentUpdate.id, 'rolled_back', 'Rolling back failed update');
      
      if (this.currentUpdate.backupPath && await fs.pathExists(this.currentUpdate.backupPath)) {
        await tar.extract({
          file: this.currentUpdate.backupPath,
          cwd: process.cwd()
        });
        logger.info('auto-update', 'System restored from backup');
      }

    } catch (error) {
      logger.error('auto-update', 'Rollback failed', error);
    }
  }

  /**
   * Restart application (Docker-compatible)
   */
  private async restartApplication(): Promise<void> {
    if (this.isDockerEnvironment) {
      logger.info('auto-update', 'Signaling container restart...');

      const restartSignalPath = '/app/volumes/restart-signal';
      await fs.writeFile(restartSignalPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        reason: 'auto-update-completed',
        version: this.currentUpdate?.version
      }));

      setTimeout(() => {
        logger.info('auto-update', 'Exiting process for container restart...');
        process.exit(0);
      }, 2000);
    } else {
      logger.info('auto-update', 'Restarting application...');
      process.exit(0);
    }
  }



  /**
   * Update status in database
   */
  private async updateStatus(updateId: number, status: UpdateStatus, message?: string, data?: any): Promise<void> {
    await storage.updateSystemUpdate(updateId, {
      status,
      errorMessage: status === 'failed' ? message : undefined,
      rollbackData: data ? JSON.stringify(data) : undefined,
      completedAt: ['completed', 'failed', 'rolled_back'].includes(status) ? new Date() : undefined
    });
  }

  /**
   * Emit progress event
   */
  private emitProgress(updateId: number, status: UpdateStatus, progress: number, message: string): void {
    const progressData: UpdateProgress = {
      updateId,
      status,
      progress,
      message
    };
    
    this.emit('progress', progressData);
    storage.updateSystemUpdate(updateId, { progressPercentage: progress });
  }

  /**
   * Get update status
   */
  async getUpdateStatus(): Promise<SystemUpdate | null> {
    return this.currentUpdate;
  }

  /**
   * Check if update is in progress
   */
  isUpdateInProgress(): boolean {
    return this.updateInProgress;
  }
}

export const autoUpdateService = AutoUpdateService.getInstance();
