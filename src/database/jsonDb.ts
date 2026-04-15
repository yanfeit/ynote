import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Reading } from '../models/reading';

const DB_FILENAME = 'readings.json';

const EPOCH_ISO = new Date(0).toISOString();

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function normalizeReading(value: unknown): Reading | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const id = typeof value.id === 'string' ? value.id : '';
  const url = typeof value.url === 'string' ? value.url : '';
  const title = typeof value.title === 'string' ? value.title : '';
  if (!id || !url || !title) {
    return undefined;
  }

  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];

  return {
    id,
    url,
    title,
    author: typeof value.author === 'string' ? value.author : '',
    organization: typeof value.organization === 'string' ? value.organization : '',
    abstract: typeof value.abstract === 'string' ? value.abstract : '',
    addedAt: isValidTimestamp(value.addedAt) ? value.addedAt : EPOCH_ISO,
    updatedAt: isValidTimestamp(value.updatedAt) ? value.updatedAt : EPOCH_ISO,
    tags,
    source: typeof value.source === 'string' ? value.source : '',
    comment: typeof value.comment === 'string' ? value.comment : '',
  };
}

export class JsonDb {
  private dbPath: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private context: vscode.ExtensionContext) {
    const storagePath = context.globalStorageUri.fsPath;
    this.dbPath = path.join(storagePath, DB_FILENAME);
  }

  private async ensureStorageDir(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    await fs.promises.mkdir(dir, { recursive: true });
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

  private async readAll(): Promise<Reading[]> {
    await this.ensureStorageDir();
    try {
      const data = await fs.promises.readFile(this.dbPath, 'utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse readings database: ${message}`);
      }

      if (!Array.isArray(parsed)) {
        throw new Error('Readings database is invalid: expected a JSON array.');
      }

      return parsed
        .map(normalizeReading)
        .filter((reading): reading is Reading => reading !== undefined);
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) {
        return [];
      }
      throw err;
    }
  }

  private async writeAll(readings: Reading[]): Promise<void> {
    await this.ensureStorageDir();
    const tempPath = `${this.dbPath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(readings, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, this.dbPath);
  }

  async getAll(): Promise<Reading[]> {
    const readings = await this.readAll();
    const toTimestamp = (value: string): number => {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    return readings.sort((a, b) => toTimestamp(b.addedAt) - toTimestamp(a.addedAt));
  }

  async add(reading: Reading): Promise<void> {
    await this.withMutationLock(async () => {
      const readings = await this.readAll();
      const existing = readings.find(r => r.url === reading.url);
      if (existing) {
        throw new Error(`Reading with URL already exists: ${reading.url}`);
      }
      readings.push(reading);
      await this.writeAll(readings);
    });
  }

  async remove(id: string): Promise<void> {
    await this.withMutationLock(async () => {
      const readings = await this.readAll();
      const filtered = readings.filter(r => r.id !== id);
      if (filtered.length === readings.length) {
        throw new Error(`Reading not found: ${id}`);
      }
      await this.writeAll(filtered);
    });
  }

  async update(id: string, partial: Partial<Reading>): Promise<void> {
    await this.withMutationLock(async () => {
      const readings = await this.readAll();
      const index = readings.findIndex(r => r.id === id);
      if (index === -1) {
        throw new Error(`Reading not found: ${id}`);
      }
      readings[index] = { ...readings[index], ...partial, updatedAt: new Date().toISOString() };
      await this.writeAll(readings);
    });
  }

  async findByUrl(url: string): Promise<Reading | undefined> {
    const readings = await this.readAll();
    return readings.find(r => r.url === url);
  }

  async findById(id: string): Promise<Reading | undefined> {
    const readings = await this.readAll();
    return readings.find(r => r.id === id);
  }

  async getAllTags(): Promise<string[]> {
    const readings = await this.readAll();
    const tagCounts = new Map<string, number>();
    for (const r of readings) {
      for (const t of r.tags) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    // Sort tags by usage frequency (most used first)
    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }

  getDbPath(): string {
    return this.dbPath;
  }
}
