import fs from 'fs/promises';
import path from 'path';
import { IStorageProvider, BackupFile, UploadOptions, DownloadOptions } from './storage-provider.interface';

/**
 * Local File System Storage Provider
 */
export class LocalStorageProvider implements IStorageProvider {
  readonly name = 'local';
  private backupDir: string;

  constructor(backupDir: string) {
    this.backupDir = backupDir;
  }

  async uploadBackup(options: UploadOptions): Promise<void> {


    const filePath = path.join(this.backupDir, options.filename);
    try {
      await fs.access(filePath);
    } catch (error) {
      throw new Error(`Backup file not found: ${options.filename}`);
    }
  }

  async downloadBackup(options: DownloadOptions): Promise<void> {
    const sourcePath = path.join(this.backupDir, options.filename);
    try {
      await fs.copyFile(sourcePath, options.destinationPath);
    } catch (error) {
      throw new Error(`Failed to download backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteBackup(filename: string): Promise<void> {
    const filePath = path.join(this.backupDir, filename);
    try {
      await fs.unlink(filePath);
    } catch (error) {

      if ((error as any).code !== 'ENOENT') {
        throw new Error(`Failed to delete backup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async listBackups(): Promise<BackupFile[]> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles: BackupFile[] = [];

      for (const file of files) {
        if (file.endsWith('.sql') || file.endsWith('.backup')) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          backupFiles.push({
            filename: file,
            size: stats.size,
            created_at: stats.birthtime
          });
        }
      }

      return backupFiles;
    } catch (error) {
      throw new Error(`Failed to list backups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.backupDir);
      return true;
    } catch {
      return false;
    }
  }
}

