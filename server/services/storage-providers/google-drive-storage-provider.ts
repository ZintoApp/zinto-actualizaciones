import { IStorageProvider, BackupFile, UploadOptions, DownloadOptions } from './storage-provider.interface';
import { GoogleDriveService } from '../google-drive-service';

/**
 * Google Drive Storage Provider
 */
export class GoogleDriveStorageProvider implements IStorageProvider {
  readonly name = 'google_drive';
  private driveService: GoogleDriveService;

  constructor() {
    this.driveService = new GoogleDriveService();
  }

  async uploadBackup(options: UploadOptions): Promise<void> {
    try {
      await this.driveService.uploadBackup(options.filePath, options.filename);
    } catch (error) {
      throw new Error(`Failed to upload to Google Drive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async downloadBackup(options: DownloadOptions): Promise<void> {
    try {
      await this.driveService.downloadBackup(options.filename, options.destinationPath);
    } catch (error) {
      throw new Error(`Failed to download from Google Drive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteBackup(filename: string): Promise<void> {
    try {
      await this.driveService.deleteBackup(filename);
    } catch (error) {
      throw new Error(`Failed to delete from Google Drive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listBackups(): Promise<BackupFile[]> {
    try {
      const files = await this.driveService.listBackups();
      return files.map(file => ({
        filename: file.name,
        size: file.size,
        created_at: new Date(file.createdTime)
      }));
    } catch (error) {
      throw new Error(`Failed to list Google Drive backups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {

      const oauthConfig = await this.driveService.getOAuthConfig();
      return oauthConfig.configured;
    } catch {
      return false;
    }
  }
}

