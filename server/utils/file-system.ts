import fs from 'fs/promises';
import path from 'path';

/**
 * Ensure upload directories exist
 */
export async function ensureUploadDirectories(): Promise<void> {
  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'uploads', 'knowledge-base'),
    path.join(process.cwd(), 'uploads', 'knowledge-base', 'temp'),
    path.join(process.cwd(), 'uploads', 'frontend-website'),
  ];

  for (const dir of uploadDirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });

    }
  }
}

/**
 * Clean up temporary files older than specified age
 */
export async function cleanupTempFiles(maxAgeHours: number = 24): Promise<void> {
  const tempDir = path.join(process.cwd(), 'uploads', 'knowledge-base', 'temp');
  const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
  
  try {
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);

      }
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}

/**
 * Clean up a branding asset file stored under uploads/branding.
 */
export async function cleanupOldBrandingAsset(oldUrl: string | undefined): Promise<void> {
  if (!oldUrl) {
    return;
  }

  try {
    // Extract filename from URL (e.g., /uploads/branding/filename.jpg?v=123456)
    const urlPath = oldUrl.split('?')[0];
    const filename = path.basename(urlPath);
    
    if (!filename) {
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', 'branding', filename);
    
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
    } catch (error) {
      // File doesn't exist or can't be deleted - that's okay, just log it
      console.log(`Could not delete old branding file: ${filename}`);
    }
  } catch (error) {
    // Log but don't throw - cleanup failures shouldn't break the upload
    console.error('Error cleaning up old branding asset:', error);
  }
}

/**
 * Clean up a frontend website asset file stored under uploads/frontend-website.
 */
export async function cleanupFrontendWebsiteAsset(filePathOrUrl: string | undefined): Promise<void> {
  if (!filePathOrUrl) {
    return;
  }

  try {
    const urlPath = filePathOrUrl.split('?')[0];
    const filename = path.basename(urlPath);

    if (!filename) {
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', 'frontend-website', filename);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
    } catch {
      console.log(`Could not delete frontend website file: ${filename}`);
    }
  } catch (error) {
    console.error('Error cleaning up frontend website asset:', error);
  }
}

/**
 * Backward-compatible wrapper for auth background cleanup.
 */
export async function cleanupOldAuthBackground(oldUrl: string | undefined): Promise<void> {
  await cleanupOldBrandingAsset(oldUrl);
}