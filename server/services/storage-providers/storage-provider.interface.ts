/**
 * Storage Provider Interface
 * Defines the contract for backup storage providers
 */

export interface BackupFile {
  filename: string;
  size: number;
  created_at: Date;
  checksum?: string;
}

export interface UploadOptions {
  filename: string;
  filePath: string;
  metadata?: Record<string, any>;
}

export interface DownloadOptions {
  filename: string;
  destinationPath: string;
}

export interface IStorageProvider {
  /**
   * Provider name/identifier
   */
  readonly name: string;

  /**
   * Upload a backup file to the storage provider
   */
  uploadBackup(options: UploadOptions): Promise<void>;

  /**
   * Download a backup file from the storage provider
   */
  downloadBackup(options: DownloadOptions): Promise<void>;

  /**
   * Delete a backup file from the storage provider
   */
  deleteBackup(filename: string): Promise<void>;

  /**
   * List all backup files in the storage provider
   */
  listBackups(): Promise<BackupFile[]>;

  /**
   * Check if the provider is properly configured and available
   */
  isAvailable(): Promise<boolean>;
}

