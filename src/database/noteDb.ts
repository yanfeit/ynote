import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Note } from '../models/note';

const NOTES_DIR = 'notes';

const EPOCH_ISO = new Date(0).toISOString();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize a title for use as a filename.
 * Replaces disallowed characters, collapses dashes, truncates to 100 chars.
 */
function sanitizeTitle(title: string): string {
  let name = title
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (name.length > 100) {
    name = name.slice(0, 100).replace(/-+$/, '');
  }

  return name || 'untitled';
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/**
 * Parse YAML-like front matter from a Markdown string.
 * Expects content starting with `---\n` and ending with `\n---\n`.
 * Returns parsed key-value pairs and the body after the front matter.
 */
function parseFrontMatter(content: string): { meta: Record<string, string | string[]>; body: string } | undefined {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return undefined;
  }

  const lineBreak = content.includes('\r\n') ? '\r\n' : '\n';
  const endMarker = `${lineBreak}---${lineBreak}`;
  const endIndex = content.indexOf(endMarker, 4);
  if (endIndex === -1) {
    return undefined;
  }

  const frontMatterBlock = content.slice(content.indexOf(lineBreak) + lineBreak.length, endIndex);
  const body = content.slice(endIndex + endMarker.length);
  const meta: Record<string, string | string[]> = {};

  const lines = frontMatterBlock.split(lineBreak);
  let currentKey = '';

  for (const line of lines) {
    // Array item: "  - value"
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey) {
      const existing = meta[currentKey];
      if (Array.isArray(existing)) {
        existing.push(arrayMatch[1].trim());
      } else {
        meta[currentKey] = [arrayMatch[1].trim()];
      }
      continue;
    }

    // Key-value: "key: value"
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value) {
        meta[currentKey] = value;
      } else {
        // Empty value — might be followed by array items
        meta[currentKey] = [];
      }
    }
  }

  return { meta, body };
}

/**
 * Serialize front matter and body back into a Markdown string.
 */
function serializeFrontMatter(meta: { id: string; title: string; createdAt: string; updatedAt: string; tags: string[] }, body: string): string {
  let fm = '---\n';
  fm += `id: ${meta.id}\n`;
  fm += `title: ${meta.title}\n`;
  fm += `createdAt: ${meta.createdAt}\n`;
  fm += `updatedAt: ${meta.updatedAt}\n`;
  fm += 'tags:\n';
  for (const tag of meta.tags) {
    fm += `  - ${tag}\n`;
  }
  fm += '---\n';
  return fm + body;
}

export class NoteDb {
  private notesDir: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private context: vscode.ExtensionContext) {
    this.notesDir = path.join(context.globalStorageUri.fsPath, NOTES_DIR);
  }

  private async ensureNotesDir(): Promise<void> {
    await fs.promises.mkdir(this.notesDir, { recursive: true });
  }

  private isFileNotFound(err: unknown): boolean {
    return Boolean(
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'
    );
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let releaseCurrent: () => void = () => {};
    this.mutationQueue = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      releaseCurrent();
    }
  }

  /**
   * Parse a note's front matter from its .md file and return a Note object.
   */
  private async parseNoteFile(filePath: string): Promise<Note | undefined> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const result = parseFrontMatter(content);
      if (!result) {
        return undefined;
      }

      const { meta } = result;
      const id = typeof meta.id === 'string' ? meta.id : '';
      const title = typeof meta.title === 'string' ? meta.title : '';
      if (!id || !title) {
        return undefined;
      }

      const createdAt = typeof meta.createdAt === 'string' && isValidTimestamp(meta.createdAt)
        ? meta.createdAt : EPOCH_ISO;
      const updatedAt = typeof meta.updatedAt === 'string' && isValidTimestamp(meta.updatedAt)
        ? meta.updatedAt : EPOCH_ISO;
      const tags = Array.isArray(meta.tags)
        ? meta.tags.filter(t => typeof t === 'string' && t.trim().length > 0)
        : [];

      return { id, title, createdAt, updatedAt, tags, filePath };
    } catch {
      return undefined;
    }
  }

  /**
   * Get all notes sorted by updatedAt descending (newest first).
   * Also migrates any legacy UUID-named files to title-based filenames.
   */
  async getAll(): Promise<Note[]> {
    await this.ensureNotesDir();
    await this.migrateUuidFilenames();
    const notes: Note[] = [];

    try {
      const files = await fs.promises.readdir(this.notesDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(this.notesDir, file);
          const note = await this.parseNoteFile(filePath);
          if (note) {
            notes.push(note);
          }
        }
      }
    } catch (err: unknown) {
      if (!this.isFileNotFound(err)) {
        throw err;
      }
    }

    const toTimestamp = (value: string): number => {
      const ts = Date.parse(value);
      return Number.isFinite(ts) ? ts : 0;
    };
    return notes.sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
  }

  /**
   * Create a new note with the given title and optional tags.
   * Returns the created Note with the file already written to disk.
   */
  async add(title: string, tags: string[] = []): Promise<Note> {
    return this.withMutationLock(async () => {
      await this.ensureNotesDir();
      const id = uuidv4();
      const now = new Date().toISOString();
      const filePath = await this.resolveUniqueFilePath(title);

      const meta = { id, title, createdAt: now, updatedAt: now, tags };
      const body = `\n# ${title}\n\n`;
      const content = serializeFrontMatter(meta, body);

      await fs.promises.writeFile(filePath, content, 'utf-8');

      return { id, title, createdAt: now, updatedAt: now, tags, filePath };
    });
  }

  /**
   * Find a unique filename for a note based on its title.
   * Appends (2), (3), etc. for collision handling.
   */
  private async resolveUniqueFilePath(title: string): Promise<string> {
    const baseName = sanitizeTitle(title);
    let candidate = path.join(this.notesDir, `${baseName}.md`);
    let counter = 1;
    while (true) {
      try {
        await fs.promises.access(candidate);
        // File exists, try next suffix
        counter++;
        candidate = path.join(this.notesDir, `${baseName} (${counter}).md`);
      } catch {
        // File doesn't exist — use this path
        return candidate;
      }
    }
  }

  /**
   * Remove a note by deleting its .md file.
   */
  async remove(id: string): Promise<void> {
    await this.withMutationLock(async () => {
      const filePath = await this.findFileById(id);
      if (!filePath) {
        throw new Error(`Note not found: ${id}`);
      }
      try {
        await fs.promises.unlink(filePath);
      } catch (err: unknown) {
        if (this.isFileNotFound(err)) {
          throw new Error(`Note not found: ${id}`);
        }
        throw err;
      }
    });
  }

  /**
   * Update metadata fields in a note's YAML front matter.
   * Always updates `updatedAt` to the current time.
   * If the title changes, renames the file to match the new title.
   */
  async updateMetadata(id: string, partial: Partial<Pick<Note, 'title' | 'tags'>>): Promise<void> {
    await this.withMutationLock(async () => {
      const filePath = await this.findFileById(id);
      if (!filePath) {
        throw new Error(`Note not found: ${id}`);
      }

      let content: string;
      try {
        content = await fs.promises.readFile(filePath, 'utf-8');
      } catch (err: unknown) {
        if (this.isFileNotFound(err)) {
          throw new Error(`Note not found: ${id}`);
        }
        throw err;
      }

      const result = parseFrontMatter(content);
      if (!result) {
        throw new Error(`Note file has invalid front matter: ${id}`);
      }

      const currentTitle = typeof result.meta.title === 'string' ? result.meta.title : '';
      const currentTags = Array.isArray(result.meta.tags) ? result.meta.tags.filter(t => typeof t === 'string') : [];
      const currentCreatedAt = typeof result.meta.createdAt === 'string' ? result.meta.createdAt : EPOCH_ISO;

      const newTitle = partial.title ?? currentTitle;
      const meta = {
        id,
        title: newTitle,
        createdAt: currentCreatedAt,
        updatedAt: new Date().toISOString(),
        tags: partial.tags ?? currentTags,
      };

      const newContent = serializeFrontMatter(meta, result.body);
      await fs.promises.writeFile(filePath, newContent, 'utf-8');

      // Rename file if title changed
      if (partial.title && partial.title !== currentTitle) {
        const newFilePath = await this.resolveUniqueFilePath(newTitle);
        await fs.promises.rename(filePath, newFilePath);
      }
    });
  }

  /**
   * Touch the `updatedAt` field in a note's front matter (called on file save).
   */
  async touchUpdatedAt(id: string): Promise<void> {
    // touchUpdatedAt needs to find the file by ID since filenames are now title-based
    const filePath = await this.findFileById(id);
    if (!filePath) { return; }

    // Read and update in-place without going through withMutationLock
    // since updateMetadata already uses the lock
    await this.updateMetadata(id, {});
  }

  /**
   * Find a note by its ID.
   */
  async findById(id: string): Promise<Note | undefined> {
    const filePath = await this.findFileById(id);
    if (!filePath) { return undefined; }
    return this.parseNoteFile(filePath);
  }

  /**
   * Get all unique tags across all notes, sorted by frequency.
   */
  async getAllTags(): Promise<string[]> {
    const notes = await this.getAll();
    const tagCounts = new Map<string, number>();
    for (const n of notes) {
      for (const t of n.tags) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }

  /**
   * Get the absolute path for a note's .md file.
   * @deprecated Use findFileById() for title-based filenames. Kept for legacy UUID-named files.
   */
  getNotePath(id: string): string {
    return path.join(this.notesDir, `${id}.md`);
  }

  /**
   * Find a note's file path by scanning all .md files for matching front matter ID.
   */
  async findFileById(id: string): Promise<string | undefined> {
    await this.ensureNotesDir();
    // First, try the legacy UUID-named file for fast path
    const legacyPath = path.join(this.notesDir, `${id}.md`);
    try {
      await fs.promises.access(legacyPath);
      const note = await this.parseNoteFile(legacyPath);
      if (note && note.id === id) {
        return legacyPath;
      }
    } catch {
      // Not found at legacy path, scan all files
    }

    try {
      const files = await fs.promises.readdir(this.notesDir);
      for (const file of files) {
        if (!file.endsWith('.md')) { continue; }
        const filePath = path.join(this.notesDir, file);
        const note = await this.parseNoteFile(filePath);
        if (note && note.id === id) {
          return filePath;
        }
      }
    } catch {
      // Directory not found
    }
    return undefined;
  }

  /**
   * Extract the note ID from a .md file by parsing its front matter.
   * Used by the file watcher to identify which note was saved.
   */
  async getIdFromFile(filePath: string): Promise<string | undefined> {
    const note = await this.parseNoteFile(filePath);
    return note?.id;
  }

  /**
   * Migrate legacy UUID-named files to human-readable title-based filenames.
   * Called during getAll() to auto-migrate existing notes.
   */
  private async migrateUuidFilenames(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.notesDir);
      for (const file of files) {
        if (!file.endsWith('.md')) { continue; }
        const basename = file.slice(0, -3);
        if (!UUID_PATTERN.test(basename)) { continue; }

        // This file has a UUID filename — migrate it
        const filePath = path.join(this.notesDir, file);
        const note = await this.parseNoteFile(filePath);
        if (!note || !note.title) { continue; }

        const newFilePath = await this.resolveUniqueFilePath(note.title);
        try {
          await fs.promises.rename(filePath, newFilePath);
        } catch {
          // If rename fails, keep the old filename
        }
      }
    } catch {
      // Directory not found or other error — skip migration
    }
  }

  /**
   * Get the notes directory path.
   */
  getNotesDir(): string {
    return this.notesDir;
  }
}
