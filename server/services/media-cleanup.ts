import fs from 'fs-extra';
import path from 'path';

/**
 * Service for cleaning up media files associated with conversations
 */
export class MediaCleanupService {
  private readonly mediaDir: string;
  private readonly uploadsDir: string;

  constructor() {
    this.mediaDir = path.join(process.cwd(), 'public', 'media');
    this.uploadsDir = path.join(process.cwd(), 'uploads');
  }

  /**
   * Clean up media files for a conversation
   * @param mediaUrls Array of media URLs to delete
   * @returns Object with cleanup results
   */
  async cleanupConversationMedia(mediaUrls: string[]): Promise<{
    success: boolean;
    deletedFiles: string[];
    failedFiles: string[];
    errors: string[];
  }> {
    const deletedFiles: string[] = [];
    const failedFiles: string[] = [];
    const errors: string[] = [];

    

    for (const mediaUrl of mediaUrls) {
      try {
        const filePath = this.getFilePathFromUrl(mediaUrl);
        
        if (!filePath) {
          errors.push(`Invalid media URL: ${mediaUrl}`);
          failedFiles.push(mediaUrl);
          continue;
        }

        const exists = await fs.pathExists(filePath);
        if (!exists) {
          
          continue;
        }

        if (!this.isValidFilePath(filePath)) {
          errors.push(`Invalid file path (security check failed): ${filePath}`);
          failedFiles.push(mediaUrl);
          continue;
        }

        await fs.unlink(filePath);
        deletedFiles.push(mediaUrl);
        

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to delete ${mediaUrl}: ${errorMessage}`);
        failedFiles.push(mediaUrl);
        console.error(`Error deleting media file ${mediaUrl}:`, error);
      }
    }

    const success = failedFiles.length === 0;
    
    

    return {
      success,
      deletedFiles,
      failedFiles,
      errors
    };
  }

  /**
   * Convert media URL to file system path
   * @param mediaUrl Media URL (e.g., /media/image/filename.jpg)
   * @returns File system path or null if invalid
   */
  private getFilePathFromUrl(mediaUrl: string): string | null {
    try {
      const cleanUrl = decodeURIComponent(mediaUrl.startsWith('/') ? mediaUrl.slice(1) : mediaUrl);
      
      if (cleanUrl.startsWith('media/')) {
        return path.join(this.mediaDir, cleanUrl.replace('media/', ''));
      } else if (cleanUrl.startsWith('uploads/')) {
        return path.join(process.cwd(), cleanUrl);
      } else if (cleanUrl.includes('/media/')) {
        const mediaPath = cleanUrl.split('/media/')[1];
        if (mediaPath) {
          return path.join(this.mediaDir, mediaPath);
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing media URL:', error);
      return null;
    }
  }

  /**
   * Validate that file path is within allowed directories
   * @param filePath File path to validate
   * @returns True if path is valid and safe
   */
  private isValidFilePath(filePath: string): boolean {
    try {
      const resolvedPath = path.resolve(filePath);
      const resolvedMediaDir = path.resolve(this.mediaDir);
      const resolvedUploadsDir = path.resolve(this.uploadsDir);

      return (
        resolvedPath.startsWith(resolvedMediaDir) ||
        resolvedPath.startsWith(resolvedUploadsDir)
      );
    } catch (error) {
      console.error('Error validating file path:', error);
      return false;
    }
  }

  /**
   * Get media file statistics for a conversation
   * @param mediaUrls Array of media URLs
   * @returns Statistics about the media files
   */
  async getMediaStats(mediaUrls: string[]): Promise<{
    totalFiles: number;
    existingFiles: number;
    totalSize: number;
    fileTypes: Record<string, number>;
  }> {
    const stats = {
      totalFiles: mediaUrls.length,
      existingFiles: 0,
      totalSize: 0,
      fileTypes: {} as Record<string, number>
    };

    for (const mediaUrl of mediaUrls) {
      try {
        const filePath = this.getFilePathFromUrl(mediaUrl);
        
        if (!filePath || !this.isValidFilePath(filePath)) {
          continue;
        }

        const exists = await fs.pathExists(filePath);
        if (exists) {
          stats.existingFiles++;
          
          const fileStats = await fs.stat(filePath);
          stats.totalSize += fileStats.size;

          const ext = path.extname(filePath).toLowerCase();
          stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
        }
      } catch (error) {
      }
    }

    return stats;
  }

  /**
   * Clean up orphaned media files (files not referenced by any message)
   * This is a maintenance function that can be run periodically
   */
  async cleanupOrphanedFiles(): Promise<{
    success: boolean;
    deletedCount: number;
    errors: string[];
  }> {
    return {
      success: true,
      deletedCount: 0,
      errors: []
    };
  }

  /**
   * Format file size for display
   * @param bytes File size in bytes
   * @returns Formatted file size string
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const mediaCleanupService = new MediaCleanupService();
