import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Reading } from '../models/reading';

const DB_FILENAME = 'readings.json';

export class JsonDb {
  private dbPath: string;

  constructor(private context: vscode.ExtensionContext) {
    const storagePath = context.globalStorageUri.fsPath;
    this.dbPath = path.join(storagePath, DB_FILENAME);
  }

  private async ensureStorageDir(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  private async readAll(): Promise<Reading[]> {
    await this.ensureStorageDir();
    try {
      const data = await fs.promises.readFile(this.dbPath, 'utf-8');
      return JSON.parse(data) as Reading[];
    } catch {
      return [];
    }
  }

  private async writeAll(readings: Reading[]): Promise<void> {
    await this.ensureStorageDir();
    await fs.promises.writeFile(this.dbPath, JSON.stringify(readings, null, 2), 'utf-8');
  }

  async getAll(): Promise<Reading[]> {
    const readings = await this.readAll();
    return readings.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }

  async add(reading: Reading): Promise<void> {
    const readings = await this.readAll();
    const existing = readings.find(r => r.url === reading.url);
    if (existing) {
      throw new Error(`Reading with URL already exists: ${reading.url}`);
    }
    readings.push(reading);
    await this.writeAll(readings);
  }

  async remove(id: string): Promise<void> {
    const readings = await this.readAll();
    const filtered = readings.filter(r => r.id !== id);
    if (filtered.length === readings.length) {
      throw new Error(`Reading not found: ${id}`);
    }
    await this.writeAll(filtered);
  }

  async update(id: string, partial: Partial<Reading>): Promise<void> {
    const readings = await this.readAll();
    const index = readings.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Reading not found: ${id}`);
    }
    readings[index] = { ...readings[index], ...partial, updatedAt: new Date().toISOString() };
    await this.writeAll(readings);
  }

  async findByUrl(url: string): Promise<Reading | undefined> {
    const readings = await this.readAll();
    return readings.find(r => r.url === url);
  }

  getDbPath(): string {
    return this.dbPath;
  }
}
