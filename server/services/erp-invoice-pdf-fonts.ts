import fs from 'fs-extra';
import { existsSync } from 'node:fs';
import path from 'path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import PDFDocument from 'pdfkit';

type PdfDoc = InstanceType<typeof PDFDocument>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Fixed fonts shipped under `server/fonts/noto/` (copied to `dist/fonts/noto` in production). */
export const BUNDLED_NOTO_FIXED_FILES = [
  'NotoSans-Regular.ttf',
  'NotoSansArabic-Regular.ttf',
  'NotoSansDevanagari-Regular.ttf',
  'NotoSansHebrew-Regular.ttf',
] as const;

/**
 * Resolves the directory containing bundled Noto TTFs for invoice PDFs.
 * Tries, in order: `BOTHIVE_PDF_FONTS_DIR`, layouts for bundled `dist/index.js`,
 * development `server/services`, and a repo checkout next to `dist`.
 *
 * @param serviceFileDirname — `__dirname` of this module, or a simulated value (e.g. `.../dist`) in tests.
 */
export function resolveBundledNotoDirectory(serviceFileDirname: string): string | null {
  const envDir = process.env.BOTHIVE_PDF_FONTS_DIR?.trim();
  const candidates: string[] = [];
  if (envDir) candidates.push(envDir);
  candidates.push(
    path.join(serviceFileDirname, 'fonts', 'noto'),
    path.join(serviceFileDirname, '..', 'server', 'fonts', 'noto'),
    path.join(serviceFileDirname, '..', 'fonts', 'noto')
  );

  const seen = new Set<string>();
  for (const dir of candidates) {
    const normalized = path.normalize(dir);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (!existsSync(normalized)) continue;
    const allPresent = BUNDLED_NOTO_FIXED_FILES.every((f) => existsSync(path.join(normalized, f)));
    if (allPresent) return normalized;
  }
  return null;
}

let cachedNotoDir: string | null | undefined;

function getBundledNotoDirectory(): string | null {
  if (cachedNotoDir === undefined) {
    cachedNotoDir = resolveBundledNotoDirectory(__dirname);
  }
  return cachedNotoDir;
}

function bundledPaths(notoDir: string | null) {
  const base = notoDir ?? path.join(__dirname, '__bundled_noto_unresolved__');
  return {
    sans: path.join(base, 'NotoSans-Regular.ttf'),
    arabic: path.join(base, 'NotoSansArabic-Regular.ttf'),
    devanagari: path.join(base, 'NotoSansDevanagari-Regular.ttf'),
    hebrew: path.join(base, 'NotoSansHebrew-Regular.ttf'),
  };
}

const CJK_URL: Record<'jp' | 'sc' | 'kr', string> = {
  jp: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf',
  sc: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  kr: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf',
};

const CJK_FILES: Record<'jp' | 'sc' | 'kr', string> = {
  jp: 'NotoSansCJKjp-Regular.otf',
  sc: 'NotoSansCJKsc-Regular.otf',
  kr: 'NotoSansCJKkr-Regular.otf',
};

const cjkDiskCache = new Map<'jp' | 'sc' | 'kr', Promise<string | null>>();

async function ensureCjkFontOnDisk(which: 'jp' | 'sc' | 'kr', notoDir: string | null): Promise<string | null> {
  const fileName = CJK_FILES[which];
  if (notoDir) {
    const bundledCjk = path.join(notoDir, 'cjk', fileName);
    if (existsSync(bundledCjk)) return bundledCjk;
  }

  const existing = cjkDiskCache.get(which);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    const cacheDir = path.join(os.tmpdir(), 'bothive-noto-cjk');
    const dest = path.join(cacheDir, fileName);
    try {
      if (await fs.pathExists(dest)) return dest;
      await fs.ensureDir(cacheDir);
      const res = await axios.get<ArrayBuffer>(CJK_URL[which], {
        responseType: 'arraybuffer',
        timeout: 180_000,
        maxContentLength: 40 * 1024 * 1024,
      });
      await fs.writeFile(dest, Buffer.from(res.data));
      return dest;
    } catch (err) {
      console.warn(
        `[erp-invoice-pdf-fonts] CJK font download/cache failed for ${which} (${fileName}):`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  })();

  cjkDiskCache.set(which, promise);
  return promise;
}

function langPrimary(language: string): string {
  return language?.trim().split(/[-_]/)[0]?.toLowerCase() ?? 'en';
}

/** Scripts where invoice totals-in-words read right-to-left in PDF layout. */
export function amountInWordsUsesRtl(language: string): boolean {
  const p = langPrimary(language);
  return p === 'ar' || p === 'he' || p === 'fa' || p === 'ur';
}

/**
 * Registers Unicode-capable fonts on the PDF document and returns the registered family name
 * to use for the amount-in-words line.
 */
export async function registerAmountInWordsPdfFont(doc: PdfDoc, language: string): Promise<string> {
  const p = langPrimary(language);
  const notoDir = getBundledNotoDirectory();
  const BUNDLED = bundledPaths(notoDir);

  const tryRegister = (name: string, filePath: string): boolean => {
    try {
      if (!existsSync(filePath)) return false;
      doc.registerFont(name, filePath);
      return true;
    } catch (err) {
      console.warn(`[erp-invoice-pdf-fonts] registerFont failed for ${name} (${filePath}):`, err);
      return false;
    }
  };

  const sansOk = notoDir ? tryRegister('PowNotoSans', BUNDLED.sans) : false;

  if (p === 'ar' || p === 'fa' || p === 'ur') {
    if (tryRegister('PowNotoArabic', BUNDLED.arabic)) return 'PowNotoArabic';
    if (!notoDir) {
      console.warn('[erp-invoice-pdf-fonts] Arabic amount-in-words: bundled Noto dir missing; glyphs may be wrong.');
    }
  }
  if (p === 'he' || p === 'yi') {
    if (tryRegister('PowNotoHebrew', BUNDLED.hebrew)) return 'PowNotoHebrew';
    if (!notoDir) {
      console.warn('[erp-invoice-pdf-fonts] Hebrew amount-in-words: bundled Noto dir missing; glyphs may be wrong.');
    }
  }
  if (p === 'hi' || p === 'mr' || p === 'ne') {
    if (tryRegister('PowNotoDevanagari', BUNDLED.devanagari)) return 'PowNotoDevanagari';
    if (!notoDir) {
      console.warn('[erp-invoice-pdf-fonts] Devanagari amount-in-words: bundled Noto dir missing; glyphs may be wrong.');
    }
  }

  if (p === 'ja') {
    const fp = await ensureCjkFontOnDisk('jp', notoDir);
    if (fp && tryRegister('PowNotoCJKJP', fp)) return 'PowNotoCJKJP';
    console.warn(
      '[erp-invoice-pdf-fonts] Japanese amount-in-words: no CJK font registered; falling back to base font (may show missing glyphs).'
    );
  }
  if (p === 'zh') {
    const fp = await ensureCjkFontOnDisk('sc', notoDir);
    if (fp && tryRegister('PowNotoCJKSC', fp)) return 'PowNotoCJKSC';
    console.warn(
      '[erp-invoice-pdf-fonts] Chinese amount-in-words: no CJK font registered; falling back to base font (may show missing glyphs).'
    );
  }
  if (p === 'ko') {
    const fp = await ensureCjkFontOnDisk('kr', notoDir);
    if (fp && tryRegister('PowNotoCJKKR', fp)) return 'PowNotoCJKKR';
    console.warn(
      '[erp-invoice-pdf-fonts] Korean amount-in-words: no CJK font registered; falling back to base font (may show missing glyphs).'
    );
  }

  if (sansOk) return 'PowNotoSans';
  console.warn('[erp-invoice-pdf-fonts] PowNotoSans unavailable; using Helvetica for amount-in-words.');
  return 'Helvetica';
}
