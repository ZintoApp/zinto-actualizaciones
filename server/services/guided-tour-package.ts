import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import { tourDefinitionSchema, tourPublicationErrors, normalizeTourMediaUrl, TOUR_MEDIA_LIMIT, type TourDefinition } from '../../shared/guided-tours';
import { TOUR_PACKAGE_LIMITS as limits, tourPackageSchema, tourMediaItems, type TourPackage, type TourImportRequest, type TourImportPreview } from '../../shared/guided-tour-package';
import { TOUR_SIGNALS } from '../../shared/guided-tour-registry';
import { tourConfigurationErrors } from './guided-tour-validation';
import { mimeExtensions, signatureMatches } from './guided-tour-media';
import type { createGuidedTourStore, ImportedTour } from './guided-tour-store';

export class TourPackageError extends Error {
  constructor(public code = 'package_invalid') { super(code); }
}
type Store = ReturnType<typeof createGuidedTourStore>;
type Stage = { owner: number; directory: string; expiresAt: number; manifest: TourPackage; definitions: (TourDefinition | null)[]; preview: TourImportPreview };
function fail(code?: string): never { throw new TourPackageError(code); }

async function inspectFile(filename: string, maximum: number) {
  let size = 0, head = Buffer.alloc(0);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    size += chunk.length;
    if (size > maximum) fail('package_limit');
    if (head.length < 12) head = Buffer.concat([head, chunk]).subarray(0, 12);
    hash.update(chunk);
  }
  return { size, head, sha256: hash.digest('hex') };
}

// Only two kinds of archive names are accepted. Archive paths never determine local filenames.
export async function readTourPackage(filename: string, directory: string): Promise<TourPackage> {
  if ((await fs.stat(filename)).size > limits.zip) fail('package_limit');
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(filename, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => error ? reject(error) : resolve(zip!)));
  const entries = new Map<string, { size: number; head: Buffer; sha256: string }>();
  let expanded = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject); zip.on('end', resolve);
      zip.on('entry', (entry: yauzl.Entry) => { void (async () => {
        const name = entry.fileName, mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (entries.has(name) || (name !== 'manifest.json' && !/^assets\/[a-f0-9-]{36}$/.test(name)) || (mode !== 0 && mode !== 0x8000) || (entry.generalPurposeBitFlag & 1) || ![0, 8].includes(entry.compressionMethod)) fail();
        if (entries.size >= limits.entries || entry.uncompressedSize > (name === 'manifest.json' ? limits.manifest : TOUR_MEDIA_LIMIT) || expanded + entry.uncompressedSize > limits.expanded) fail('package_limit');
        const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(entry, (err, input) => err ? rej(err) : res(input!)));
        let size = 0, head = Buffer.alloc(0); const hash = createHash('sha256');
        const counter = new Transform({ transform(chunk: Buffer, _encoding, done) {
          size += chunk.length; expanded += chunk.length;
          if (size > entry.uncompressedSize || expanded > limits.expanded) return done(new TourPackageError('package_limit'));
          if (head.length < 12) head = Buffer.concat([head, chunk]).subarray(0, 12);
          hash.update(chunk); done(null, chunk);
        } });
        await pipeline(stream, counter, createWriteStream(path.join(directory, name === 'manifest.json' ? name : name.slice(7)), { flags: 'wx' }));
        entries.set(name, { size, head, sha256: hash.digest('hex') });
        zip.readEntry();
      })().catch(reject); });
      zip.readEntry();
    });
    if (!entries.has('manifest.json')) fail();
    const parsed = tourPackageSchema.safeParse(JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')));
    if (!parsed.success) fail();
    const manifest = parsed.data;
    if (new Set(manifest.assets.map(asset => asset.id)).size !== manifest.assets.length || new Set(manifest.assets.map(asset => asset.path)).size !== manifest.assets.length || entries.size !== manifest.assets.length + 1) fail();
    for (const asset of manifest.assets) {
      const entry = entries.get(asset.path);
      if (asset.path !== `assets/${asset.id}` || !entry || entry.size !== asset.size || entry.sha256 !== asset.sha256 || !signatureMatches(entry.head, asset.mime)) fail();
    }
    return manifest;
  } finally { zip.close(); }
}

export function createTourPackageService(root: string, getStore: () => Store) {
  const stages = new Map<string, Stage>();
  const stagingRoot = path.join(root, '.packages');
  async function discard(token: string) {
    const stage = stages.get(token); stages.delete(token);
    if (stage) await fs.rm(stage.directory, { recursive: true, force: true });
  }
  async function cleanup() {
    for (const [token, stage] of stages) if (stage.expiresAt <= Date.now()) await discard(token);
    // Also remove abandoned staging directories after a server restart.
    for (const name of await fs.readdir(stagingRoot).catch(() => [])) {
      if (!/^[a-f0-9-]{36}$/.test(name) || [...stages.values()].some(stage => path.basename(stage.directory) === name)) continue;
      const directory = path.join(stagingRoot, name), stat = await fs.lstat(directory).catch(() => null);
      if (stat?.isDirectory() && !stat.isSymbolicLink() && stat.mtimeMs < Date.now() - limits.ttl) {
        // A lost database response is reconciled before deleting any potentially committed asset.
        const pending: unknown = await fs.readFile(path.join(directory, 'pending-files.json'), 'utf8').then(JSON.parse).catch(() => []);
        if (!Array.isArray(pending) || pending.some(filename => typeof filename !== 'string' || !/^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm|pdf)$/.test(filename))) continue;
        let resolved = true;
        for (const filename of pending) {
          try { if (!await getStore().media(path.parse(filename).name)) await fs.unlink(path.join(root, filename)).catch(() => {}); }
          catch { resolved = false; }
        }
        if (resolved) await fs.rm(directory, { recursive: true, force: true });
      }
    }
  }
  const timer = setInterval(() => { void cleanup().catch(() => {}); }, 60_000); timer.unref();
  const temporary = async () => { const directory = path.join(stagingRoot, randomUUID()); await fs.mkdir(directory, { recursive: true }); return directory; };
  function authorized(token: string, owner: number) {
    const stage = stages.get(token);
    if (!stage || stage.owner !== owner || stage.expiresAt <= Date.now()) fail('package_expired');
    return stage;
  }
  return {
    temporary,
    async cancel(token: string, owner: number) { authorized(token, owner); await discard(token); },
    async preview(filename: string, owner: number): Promise<TourImportPreview> {
      await cleanup();
      const directory = await temporary();
      try {
        const manifest = await readTourPackage(filename, directory).catch(error => { throw error instanceof TourPackageError ? error : new TourPackageError(); });
        const existing = await getStore().list(true);
        const definitions: (TourDefinition | null)[] = [];
        const tours = manifest.tours.map((item, index) => {
          const parsed = tourDefinitionSchema.safeParse(item.definition);
          if (!parsed.success) {
            definitions.push(null);
            return { index, title: {}, slug: '', feature: '', steps: 0, media: 0, languages: [], errors: ['package_configuration'], warnings: [] };
          }
          const definition = parsed.data, check = structuredClone(definition), errors: string[] = [];
          for (const media of tourMediaItems(check)) {
            if (media.url.startsWith('asset:')) {
              const asset = manifest.assets.find(asset => `asset:${asset.id}` === media.url);
              if (!asset || media.kind !== (asset.mime.startsWith('image/') ? 'image' : asset.mime.startsWith('video/') ? 'video' : 'pdf')) errors.push('invalid_media');
              media.url = `https://package.invalid/${media.id}`;
            } else {
              const url = normalizeTourMediaUrl(media.url, media.kind);
              if (!url || !url.startsWith('https:')) errors.push('invalid_media');
            }
          }
          errors.push(...tourConfigurationErrors(check));
          const warnings = tourPublicationErrors(check, TOUR_SIGNALS).filter(error => ['default_language', 'media_description'].includes(error));
          const match = existing.find(tour => tour.definition.slug === definition.slug);
          const texts = [definition.title, definition.description, ...definition.steps.flatMap(step => [step.title, step.content]), ...tourMediaItems(definition).flatMap(media => [media.caption, media.alt])];
          definitions.push(errors.length ? null : definition);
          return { index, title: definition.title, slug: definition.slug, feature: definition.feature, steps: definition.steps.length, media: tourMediaItems(definition).length,
            languages: [...new Set(texts.flatMap(text => Object.keys(text)))].sort(), errors: [...new Set(errors)], warnings,
            ...(match ? { match: { id: match.id, version: match.version, status: match.status, title: match.definition.title } } : {}) };
        });
        const token = randomUUID(), expiresAt = Date.now() + limits.ttl, preview = { token, expiresAt, tours };
        stages.set(token, { owner, directory, expiresAt, manifest, definitions, preview });
        return preview;
      } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
    },
    async commit(request: TourImportRequest, owner: number) {
      const stage = authorized(request.token, owner);
      // Consume before any asynchronous work: retrying an uncertain response cannot repeat mutations.
      stages.delete(request.token);
      const files: string[] = [];
      let reconciliationNeeded = false;
      const journal = async () => {
        await fs.writeFile(path.join(stage.directory, 'pending-files.next'), JSON.stringify(files));
        await fs.rename(path.join(stage.directory, 'pending-files.next'), path.join(stage.directory, 'pending-files.json'));
      };
      try {
        const items: ImportedTour[] = [];
        for (const selection of request.selections) {
          const original = stage.definitions[selection.index]; if (!original) fail('package_configuration');
          const match = stage.preview.tours[selection.index].match;
          if (selection.action === 'replace' && (!request.confirmReplacements || !match || selection.destination?.id !== match.id || selection.destination.version !== match.version)) fail('package_replacement');
          const definition = structuredClone(original), media: ImportedTour['media'] = [], copied = new Map<string, string>();
          for (const item of tourMediaItems(definition)) {
            if (!item.url.startsWith('asset:')) { item.id = randomUUID(); item.url = normalizeTourMediaUrl(item.url, item.kind)!; continue; }
            const asset = stage.manifest.assets.find(asset => `asset:${asset.id}` === item.url)!;
            let id = copied.get(asset.id);
            if (!id) {
              id = randomUUID(); const filename = id + mimeExtensions[asset.mime];
              files.push(filename); await journal();
              await fs.copyFile(path.join(stage.directory, asset.id), path.join(root, filename));
              copied.set(asset.id, id); media.push({ id, filename, mime: asset.mime, size: asset.size });
            }
            item.id = id; item.url = `/api/guided-tours/media/${id}`;
          }
          items.push({ definition, media, ...(selection.action === 'replace' ? { destination: selection.destination } : {}) });
        }
        // The journal also covers process termination between copying files and committing metadata.
        await journal();
        return await getStore().importBatch(items, owner);
      } catch (error) {
        // Check references before removing files: a lost COMMIT response may still have committed.
        for (const filename of files) {
          const id = path.parse(filename).name;
          const referenced = await getStore().media(id).catch(() => { reconciliationNeeded = true; return true; });
          if (!referenced) await fs.unlink(path.join(root, filename)).catch(() => {});
        }
        if (reconciliationNeeded) await journal();
        throw error;
      } finally { if (!reconciliationNeeded) await fs.rm(stage.directory, { recursive: true, force: true }); }
    },
    async export(selections: { id: number; version: number }[]) {
      const directory = await temporary();
      try {
        const snapshot = await getStore().exportSnapshot(selections);
        const manifest: TourPackage = { format: 'guided-tours', version: 1, tours: [], assets: [] };
        const assets = new Map<string, { id: string; filename: string }>();
        let expanded = 0;
        for (const tour of snapshot.tours) {
          const definition = structuredClone(tour.definition);
          for (const item of tourMediaItems(definition)) {
            if (item.url.startsWith('/api/guided-tours/media/')) {
              const row = snapshot.media.find(row => row.id === item.id && row.tour_id === tour.id);
              if (!row || item.url !== `/api/guided-tours/media/${row.id}` || !mimeExtensions[row.mime_type]) fail('invalid_media');
              let asset = assets.get(row.id);
              if (!asset) {
                const filename = path.join(root, path.basename(row.filename)), inspected = await inspectFile(filename, TOUR_MEDIA_LIMIT);
                if (!signatureMatches(inspected.head, row.mime_type)) fail('invalid_media');
                expanded += inspected.size; if (expanded > limits.expanded || assets.size >= limits.entries - 1) fail('package_limit');
                asset = { id: randomUUID(), filename }; assets.set(row.id, asset);
                manifest.assets.push({ id: asset.id, path: `assets/${asset.id}`, mime: row.mime_type, size: inspected.size, sha256: inspected.sha256 });
              }
              item.url = `asset:${asset.id}`;
            } else {
              const url = normalizeTourMediaUrl(item.url, item.kind); if (!url?.startsWith('https:')) fail('invalid_media'); item.url = url;
            }
            item.id = randomUUID();
          }
          manifest.tours.push({ definition });
        }
        const buffer = Buffer.from(JSON.stringify(manifest));
        if (buffer.length > limits.manifest || expanded + buffer.length > limits.expanded) fail('package_limit');
        const filename = path.join(directory, 'guided-tours.zip'), zip = new ZipFile();
        let size = 0;
        const counter = new Transform({ transform(chunk, _encoding, done) { size += chunk.length; done(size > limits.zip ? new TourPackageError('package_limit') : null, chunk); } });
        zip.on('error', error => (zip.outputStream as Readable).destroy(error));
        const writing = pipeline(zip.outputStream, counter, createWriteStream(filename, { flags: 'wx' }));
        zip.addBuffer(buffer, 'manifest.json');
        for (const asset of assets.values()) zip.addFile(asset.filename, `assets/${asset.id}`);
        zip.end(); await writing;
        return { filename, dispose: () => fs.rm(directory, { recursive: true, force: true }) };
      } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
    },
  };
}
