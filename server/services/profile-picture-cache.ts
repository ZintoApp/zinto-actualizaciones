import crypto from 'node:crypto';
import path from 'node:path';
import fsExtra from 'fs-extra';

function safeKey(storageKey: string): string {
  return storageKey.replace(/[^a-zA-Z0-9_-]/g, '_') || 'contact';
}

export async function listCachedProfilePictures(directory: string, storageKey: string): Promise<string[]> {
  const prefix = `${safeKey(storageKey)}_`;
  return (await fsExtra.readdir(directory).catch(() => []))
    .filter(file => file.startsWith(prefix))
    .sort();
}

export async function storeProfilePictureContent(
  directory: string,
  storageKey: string,
  content: Buffer,
): Promise<{ filename: string; changed: boolean }> {
  await fsExtra.ensureDir(directory);
  const existingFiles = await listCachedProfilePictures(directory, storageKey);
  const existingFile = existingFiles.at(-1);
  if (existingFile) {
    const existingContent = await fsExtra.readFile(path.join(directory, existingFile)).catch(() => null);
    if (existingContent && crypto.createHash('sha256').update(existingContent).digest('hex') ===
      crypto.createHash('sha256').update(content).digest('hex')) {
      return { filename: existingFile, changed: false };
    }
  }

  const filename = `${safeKey(storageKey)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
  const filepath = path.join(directory, filename);
  await fsExtra.writeFile(filepath, content);
  await Promise.all(existingFiles.map(existing => fsExtra.remove(path.join(directory, existing)).catch(() => undefined)));
  return { filename, changed: true };
}
