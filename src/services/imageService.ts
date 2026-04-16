import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const IMAGES_DIR = 'images';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp',
]);

/**
 * Sanitize a filename for safe filesystem use.
 * Replaces disallowed characters, collapses dashes, truncates to 80 chars.
 */
function sanitizeFilename(name: string): string {
  let clean = name
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .trim()
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (clean.length > 80) {
    clean = clean.slice(0, 80).replace(/-+$/, '');
  }

  return clean || 'image';
}

/**
 * Format a Date as YYYYMMDD-HHmmss.
 */
function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

export class ImageService {
  private baseImagesDir: string;

  constructor(private context: vscode.ExtensionContext) {
    this.baseImagesDir = path.join(context.globalStorageUri.fsPath, IMAGES_DIR);
  }

  /**
   * Get the base images directory path.
   */
  getBaseImagesDir(): string {
    return this.baseImagesDir;
  }

  /**
   * Get the images directory path for a specific note.
   */
  getImagesDir(noteId: string): string {
    this.validateNoteId(noteId);
    return path.join(this.baseImagesDir, noteId);
  }

  /**
   * Generate a timestamped image filename.
   * @param originalName - Original filename (without extension), or undefined for clipboard paste
   * @param ext - File extension including dot (e.g., '.png')
   */
  generateFilename(originalName?: string, ext?: string): string {
    const timestamp = formatTimestamp(new Date());
    const extension = ext || '.png';

    if (!originalName) {
      return `paste-${timestamp}${extension}`;
    }

    const sanitized = sanitizeFilename(originalName);
    return `${timestamp}-${sanitized}${extension}`;
  }

  /**
   * Save a local image file to the note's image directory.
   * @returns The saved image filename (not full path).
   */
  async saveLocalImage(noteId: string, sourcePath: string): Promise<string> {
    this.validateNoteId(noteId);
    const ext = path.extname(sourcePath).toLowerCase();
    this.validateImageExtension(ext);

    const originalName = path.basename(sourcePath, ext);
    const filename = await this.resolveUniqueFilename(noteId, originalName, ext);

    const destDir = this.getImagesDir(noteId);
    await fs.promises.mkdir(destDir, { recursive: true });

    const destPath = path.join(destDir, filename);
    await fs.promises.copyFile(sourcePath, destPath);

    return filename;
  }

  /**
   * Save an image buffer (e.g., from clipboard) to the note's image directory.
   * @returns The saved image filename (not full path).
   */
  async saveImageBuffer(noteId: string, buffer: Buffer | Uint8Array, originalName?: string, ext?: string): Promise<string> {
    this.validateNoteId(noteId);
    const extension = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '.png';
    this.validateImageExtension(extension);

    const filename = await this.resolveUniqueFilename(noteId, originalName, extension);

    const destDir = this.getImagesDir(noteId);
    await fs.promises.mkdir(destDir, { recursive: true });

    const destPath = path.join(destDir, filename);
    await fs.promises.writeFile(destPath, buffer);

    return filename;
  }

  /**
   * Get the relative Markdown image path for embedding in a note.
   * Returns a path relative to the notes/ directory: `../images/{noteId}/{filename}`
   */
  getRelativePath(noteId: string, imageFilename: string): string {
    this.validateNoteId(noteId);
    return `../images/${noteId}/${imageFilename}`;
  }

  /**
   * Delete all images for a specific note.
   */
  async deleteNoteImages(noteId: string): Promise<void> {
    this.validateNoteId(noteId);
    const dir = this.getImagesDir(noteId);
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) { return; }
      throw err;
    }
  }

  /**
   * List all image files for a specific note.
   */
  async listNoteImages(noteId: string): Promise<string[]> {
    this.validateNoteId(noteId);
    const dir = this.getImagesDir(noteId);
    try {
      const files = await fs.promises.readdir(dir);
      return files.filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) { return []; }
      throw err;
    }
  }

  /**
   * Resolve a unique filename within a note's image directory.
   * Appends -2, -3, etc. if a filename already exists.
   */
  private async resolveUniqueFilename(noteId: string, originalName: string | undefined, ext: string): Promise<string> {
    const dir = this.getImagesDir(noteId);
    const base = this.generateFilename(originalName, ext);
    const baseName = base.slice(0, base.length - ext.length);

    let candidate = base;
    let counter = 1;
    while (true) {
      try {
        await fs.promises.access(path.join(dir, candidate));
        // File exists, try next suffix
        counter++;
        candidate = `${baseName}-${counter}${ext}`;
      } catch {
        // File doesn't exist — use this name
        return candidate;
      }
    }
  }

  private validateNoteId(noteId: string): void {
    if (!UUID_PATTERN.test(noteId)) {
      throw new Error(`Invalid note ID: ${noteId}`);
    }
  }

  private validateImageExtension(ext: string): void {
    if (!IMAGE_EXTENSIONS.has(ext.toLowerCase())) {
      throw new Error(`Unsupported image format: ${ext}. Supported: ${[...IMAGE_EXTENSIONS].join(', ')}`);
    }
  }

  private isFileNotFound(err: unknown): boolean {
    return Boolean(
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'
    );
  }
}

// Export helpers for testing
export { sanitizeFilename, formatTimestamp, IMAGE_EXTENSIONS };
