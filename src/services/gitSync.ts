import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function isSafeReadingId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export interface SyncDiff {
  toWrite: Array<Record<string, unknown>>;
  toDelete: string[];
}

export class GitSync {
  private syncDir: string;

  constructor(private context: vscode.ExtensionContext) {
    this.syncDir = path.join(context.globalStorageUri.fsPath, 'sync-repo');
  }

  private getRepoUrl(): string {
    const config = vscode.workspace.getConfiguration('ynote');
    return config.get<string>('githubRepoUrl', '');
  }

  private async git(args: string[], cwd?: string): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: cwd || this.syncDir,
      timeout: 30000,
    });
    return stdout.trim();
  }

  private isFileNotFound(err: unknown): boolean {
    return Boolean(
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'
    );
  }

  async isSetup(): Promise<boolean> {
    try {
      await fs.promises.access(path.join(this.syncDir, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  async setup(): Promise<void> {
    const repoUrl = this.getRepoUrl();
    if (!repoUrl) {
      throw new Error('GitHub repo URL not configured. Set ynote.githubRepoUrl in settings.');
    }

    await fs.promises.mkdir(this.syncDir, { recursive: true });

    if (await this.isSetup()) {
      // Update remote URL if changed
      await this.git(['remote', 'set-url', 'origin', repoUrl]);
    } else {
      await this.git(['clone', repoUrl, '.'], this.syncDir);
    }
  }

  get readingsDir(): string {
    return path.join(this.syncDir, 'readings');
  }

  /**
   * Push local readings to cloud. Cloud becomes exactly what local has.
   * Uses incremental file updates: only changed entries are written, removed entries are deleted.
   */
  async sync(dbPath: string): Promise<string> {
    const repoUrl = this.getRepoUrl();
    if (!repoUrl) {
      throw new Error('GitHub repo URL not configured. Set ynote.githubRepoUrl in settings.');
    }

    if (!(await this.isSetup())) {
      await this.setup();
    }

    // Pull latest so we can push without force
    await this.pullRemote();

    // Migrate from old single-file format if needed
    await this.migrateFromSingleFile();

    const localReadings = await this.readJsonSafe(dbPath);
    const remoteReadings = await this.readIndividualFiles();
    const diff = GitSync.computeDiff(localReadings, remoteReadings);

    // Apply incremental changes to sync repo
    await fs.promises.mkdir(this.readingsDir, { recursive: true });

    for (const entry of diff.toWrite) {
      const filePath = path.join(this.readingsDir, `${entry.id}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    }

    for (const id of diff.toDelete) {
      const filePath = path.join(this.readingsDir, `${id}.json`);
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // File might not exist
      }
    }

    // Stage all changes, commit, push
    await this.git(['add', '-A']);

    try {
      const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.git(['commit', '-m', `sync readings ${date}`]);
    } catch {
      // Nothing to commit
      return 'Already up to date.';
    }

    await this.git(['push', 'origin', 'HEAD']);
    return `Pushed ${localReadings.length} readings to GitHub (${diff.toWrite.length} updated, ${diff.toDelete.length} deleted).`;
  }

  /**
   * Pull readings from cloud. Local becomes exactly what cloud has.
   */
  async pull(dbPath: string): Promise<string> {
    const repoUrl = this.getRepoUrl();
    if (!repoUrl) {
      throw new Error('GitHub repo URL not configured. Set ynote.githubRepoUrl in settings.');
    }

    if (!(await this.isSetup())) {
      await this.setup();
    }

    await this.pullRemote();

    // Migrate from old single-file format if needed
    await this.migrateFromSingleFile();

    const remoteReadings = await this.readIndividualFiles();

    // Sort newest first
    remoteReadings.sort((a, b) => {
      const dateA = parseTimestamp(a.addedAt);
      const dateB = parseTimestamp(b.addedAt);
      return dateB - dateA;
    });

    // Ensure the parent directory exists (may not on fresh installs)
    await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.promises.writeFile(dbPath, JSON.stringify(remoteReadings, null, 2), 'utf-8');

    return `Pulled ${remoteReadings.length} readings from GitHub.`;
  }

  /**
   * Migrate from old readings.json single-file format to per-entry files.
   */
  async migrateFromSingleFile(): Promise<void> {
    const oldPath = path.join(this.syncDir, 'readings.json');
    try {
      await fs.promises.access(oldPath);
    } catch {
      return; // No old file
    }

    try {
      const data = await fs.promises.readFile(oldPath, 'utf-8');
      const readings = JSON.parse(data) as Array<Record<string, unknown>>;
      await fs.promises.mkdir(this.readingsDir, { recursive: true });

      for (const entry of readings) {
        if (isSafeReadingId(entry.id)) {
          const filePath = path.join(this.readingsDir, `${entry.id}.json`);
          // Only write if file doesn't already exist (don't overwrite newer individual files)
          try {
            await fs.promises.access(filePath);
          } catch {
            await fs.promises.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
          }
        }
      }

      await fs.promises.unlink(oldPath);
    } catch {
      // Parse error or other issue — skip migration
    }
  }

  /**
   * Read individual reading files from sync-repo/readings/
   */
  async readIndividualFiles(): Promise<Array<Record<string, unknown>>> {
    const readings: Array<Record<string, unknown>> = [];
    try {
      const files = await fs.promises.readdir(this.readingsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.promises.readFile(path.join(this.readingsDir, file), 'utf-8');
            readings.push(JSON.parse(data));
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) {
        return readings;
      }
      throw new Error('Failed to read synced readings directory.');
    }
    return readings;
  }

  private async pullRemote(): Promise<void> {
    // Clean up dirty state from previously failed operations
    try {
      await this.git(['rebase', '--abort']);
    } catch { /* no rebase in progress */ }
    try {
      await this.git(['reset', '--hard', 'HEAD']);
    } catch { /* empty repo with no HEAD */ }

    try {
      await this.git(['pull', '--rebase', 'origin', 'main']);
      return;
    } catch (mainErr: unknown) {
      const msg = mainErr instanceof Error ? mainErr.message : String(mainErr);
      // Only fall through to try 'master' if the branch was not found
      if (!msg.includes("couldn't find remote ref")) {
        throw mainErr;
      }
    }

    try {
      await this.git(['pull', '--rebase', 'origin', 'master']);
    } catch (masterErr: unknown) {
      const msg = masterErr instanceof Error ? masterErr.message : String(masterErr);
      // Empty repo — no remote branches exist yet (first push scenario)
      if (!msg.includes("couldn't find remote ref")) {
        throw masterErr;
      }
    }
  }

  private async readJsonSafe(filePath: string): Promise<Array<Record<string, unknown>>> {
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        throw new Error('Local readings database is invalid: expected an array.');
      }
      return parsed.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) {
        return [];
      }
      if (err instanceof Error) {
        throw new Error(`Failed to read local readings: ${err.message}`);
      }
      throw new Error('Failed to read local readings.');
    }
  }

  /**
   * Compute the diff needed to make remote match local.
   * Returns entries to write (new or changed) and IDs to delete.
   */
  static computeDiff(
    local: Array<Record<string, unknown>>,
    remote: Array<Record<string, unknown>>
  ): SyncDiff {
    const remoteById = new Map<string, Record<string, unknown>>();
    for (const r of remote) {
      if (isSafeReadingId(r.id)) {
        remoteById.set(r.id, r);
      }
    }

    const localById = new Map<string, Record<string, unknown>>();
    for (const r of local) {
      if (isSafeReadingId(r.id)) {
        localById.set(r.id, r);
      }
    }

    const toWrite: Array<Record<string, unknown>> = [];
    const toDelete: string[] = [];

    // Entries in local that are new or changed compared to remote
    for (const [id, localEntry] of localById) {
      const remoteEntry = remoteById.get(id);
      if (!remoteEntry || JSON.stringify(localEntry) !== JSON.stringify(remoteEntry)) {
        toWrite.push(localEntry);
      }
    }

    // Entries in remote that are not in local → delete
    for (const id of remoteById.keys()) {
      if (!localById.has(id)) {
        toDelete.push(id);
      }
    }

    return { toWrite, toDelete };
  }
}
