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

  get notesDir(): string {
    return path.join(this.syncDir, 'notes');
  }

  get imagesDir(): string {
    return path.join(this.syncDir, 'images');
  }

  /**
   * Push local readings to cloud. Cloud becomes exactly what local has.
   * Uses incremental file updates: only changed entries are written, removed entries are deleted.
   */
  async sync(dbPath: string, localNotesDir?: string, localImagesDir?: string): Promise<string> {
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

    // Sync notes (Markdown files)
    let noteCount = 0;
    if (localNotesDir) {
      noteCount = await this.syncNotes(localNotesDir);
    }

    // Sync images (binary files in per-note subdirectories)
    let imageCount = 0;
    if (localImagesDir) {
      imageCount = await this.syncImages(localImagesDir);
    }

    // Stage all changes, commit, push
    await this.git(['add', '-A']);

    try {
      const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.git(['commit', '-m', `sync ${date}`]);
    } catch {
      // Nothing to commit
      return 'Already up to date.';
    }

    await this.git(['push', 'origin', 'HEAD']);
    let msg = `Pushed ${localReadings.length} readings (${diff.toWrite.length} updated, ${diff.toDelete.length} deleted)`;
    if (noteCount > 0) {
      msg += `, ${noteCount} notes`;
    }
    if (imageCount > 0) {
      msg += `, ${imageCount} images`;
    }
    msg += ' to GitHub.';
    return msg;
  }

  /**
   * Pull readings from cloud. Local becomes exactly what cloud has.
   */
  async pull(dbPath: string, localNotesDir?: string, localImagesDir?: string): Promise<string> {
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

    // Pull notes (Markdown files)
    let noteCount = 0;
    if (localNotesDir) {
      noteCount = await this.pullNotes(localNotesDir);
    }

    // Pull images (binary files in per-note subdirectories)
    let imageCount = 0;
    if (localImagesDir) {
      imageCount = await this.pullImages(localImagesDir);
    }

    let msg = `Pulled ${remoteReadings.length} readings`;
    if (noteCount > 0) {
      msg += ` and ${noteCount} notes`;
    }
    if (imageCount > 0) {
      msg += ` and ${imageCount} images`;
    }
    msg += ' from GitHub.';
    return msg;
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

  /**
   * Sync local notes (.md files) to sync-repo/notes/.
   * Copies changed files, deletes removed ones. Returns the total note count.
   */
  async syncNotes(localNotesDir: string): Promise<number> {
    await fs.promises.mkdir(this.notesDir, { recursive: true });

    // Read local note files
    let localFiles: string[] = [];
    try {
      localFiles = (await fs.promises.readdir(localNotesDir))
        .filter(f => f.endsWith('.md'));
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) { return 0; }
      throw err;
    }

    // Read remote note files
    let remoteFiles: string[] = [];
    try {
      remoteFiles = (await fs.promises.readdir(this.notesDir))
        .filter(f => f.endsWith('.md'));
    } catch (err: unknown) {
      if (!this.isFileNotFound(err)) { throw err; }
    }

    const remoteSet = new Set(remoteFiles);

    // Copy new or changed local files to sync dir
    for (const file of localFiles) {
      const localPath = path.join(localNotesDir, file);
      const remotePath = path.join(this.notesDir, file);
      const localContent = await fs.promises.readFile(localPath, 'utf-8');

      let remoteContent = '';
      if (remoteSet.has(file)) {
        try {
          remoteContent = await fs.promises.readFile(remotePath, 'utf-8');
        } catch { /* treat as missing */ }
      }

      if (localContent !== remoteContent) {
        await fs.promises.writeFile(remotePath, localContent, 'utf-8');
      }
    }

    // Delete remote files not in local
    const localSet = new Set(localFiles);
    for (const file of remoteFiles) {
      if (!localSet.has(file)) {
        try {
          await fs.promises.unlink(path.join(this.notesDir, file));
        } catch { /* already gone */ }
      }
    }

    return localFiles.length;
  }

  /**
   * Pull notes from sync-repo/notes/ to local notes directory.
   * Overwrites local with remote content. Returns the note count.
   */
  async pullNotes(localNotesDir: string): Promise<number> {
    await fs.promises.mkdir(localNotesDir, { recursive: true });

    let remoteFiles: string[] = [];
    try {
      remoteFiles = (await fs.promises.readdir(this.notesDir))
        .filter(f => f.endsWith('.md'));
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) { return 0; }
      throw err;
    }

    // Copy remote → local
    for (const file of remoteFiles) {
      const content = await fs.promises.readFile(path.join(this.notesDir, file), 'utf-8');
      await fs.promises.writeFile(path.join(localNotesDir, file), content, 'utf-8');
    }

    // Delete local files not in remote
    let localFiles: string[] = [];
    try {
      localFiles = (await fs.promises.readdir(localNotesDir))
        .filter(f => f.endsWith('.md'));
    } catch { /* empty */ }

    const remoteSet = new Set(remoteFiles);
    for (const file of localFiles) {
      if (!remoteSet.has(file)) {
        try {
          await fs.promises.unlink(path.join(localNotesDir, file));
        } catch { /* already gone */ }
      }
    }

    return remoteFiles.length;
  }

  /**
   * Sync local images to sync-repo/images/.
   * Images are organized in per-note subdirectories: images/{noteId}/{filename}.
   * Copies new/changed files, removes deleted note directories. Returns total image count.
   */
  async syncImages(localImagesDir: string): Promise<number> {
    await fs.promises.mkdir(this.imagesDir, { recursive: true });

    // Read local note subdirectories
    let localSubdirs: string[] = [];
    try {
      const entries = await fs.promises.readdir(localImagesDir, { withFileTypes: true });
      localSubdirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) { return 0; }
      throw err;
    }

    let totalCount = 0;

    // Copy local → remote for each note subdirectory
    for (const subdir of localSubdirs) {
      const localSubPath = path.join(localImagesDir, subdir);
      const remoteSubPath = path.join(this.imagesDir, subdir);
      await fs.promises.mkdir(remoteSubPath, { recursive: true });

      const localFiles = await fs.promises.readdir(localSubPath);
      const remoteFiles = new Set<string>();
      try {
        for (const f of await fs.promises.readdir(remoteSubPath)) {
          remoteFiles.add(f);
        }
      } catch { /* empty */ }

      for (const file of localFiles) {
        const localFilePath = path.join(localSubPath, file);
        const remoteFilePath = path.join(remoteSubPath, file);

        // Compare by file size for binary files
        let needsCopy = true;
        if (remoteFiles.has(file)) {
          try {
            const localStat = await fs.promises.stat(localFilePath);
            const remoteStat = await fs.promises.stat(remoteFilePath);
            if (localStat.size === remoteStat.size) {
              // Same size — compare content
              const localBuf = await fs.promises.readFile(localFilePath);
              const remoteBuf = await fs.promises.readFile(remoteFilePath);
              needsCopy = !localBuf.equals(remoteBuf);
            }
          } catch { /* treat as needing copy */ }
        }

        if (needsCopy) {
          await fs.promises.copyFile(localFilePath, remoteFilePath);
        }
        totalCount++;
      }

      // Delete remote files not in local
      for (const file of remoteFiles) {
        if (!localFiles.includes(file)) {
          try {
            await fs.promises.unlink(path.join(remoteSubPath, file));
          } catch { /* already gone */ }
        }
      }
    }

    // Delete remote subdirectories not in local
    const localSubdirSet = new Set(localSubdirs);
    try {
      const remoteEntries = await fs.promises.readdir(this.imagesDir, { withFileTypes: true });
      for (const entry of remoteEntries) {
        if (entry.isDirectory() && !localSubdirSet.has(entry.name)) {
          await fs.promises.rm(path.join(this.imagesDir, entry.name), { recursive: true, force: true });
        }
      }
    } catch { /* empty */ }

    return totalCount;
  }

  /**
   * Pull images from sync-repo/images/ to local images directory.
   * Overwrites local with remote content. Returns total image count.
   */
  async pullImages(localImagesDir: string): Promise<number> {
    await fs.promises.mkdir(localImagesDir, { recursive: true });

    let remoteSubdirs: string[] = [];
    try {
      const entries = await fs.promises.readdir(this.imagesDir, { withFileTypes: true });
      remoteSubdirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (err: unknown) {
      if (this.isFileNotFound(err)) { return 0; }
      throw err;
    }

    let totalCount = 0;

    // Copy remote → local for each note subdirectory
    for (const subdir of remoteSubdirs) {
      const remoteSubPath = path.join(this.imagesDir, subdir);
      const localSubPath = path.join(localImagesDir, subdir);
      await fs.promises.mkdir(localSubPath, { recursive: true });

      const files = await fs.promises.readdir(remoteSubPath);
      for (const file of files) {
        await fs.promises.copyFile(
          path.join(remoteSubPath, file),
          path.join(localSubPath, file)
        );
        totalCount++;
      }
    }

    // Delete local subdirectories not in remote
    const remoteSubdirSet = new Set(remoteSubdirs);
    try {
      const localEntries = await fs.promises.readdir(localImagesDir, { withFileTypes: true });
      for (const entry of localEntries) {
        if (entry.isDirectory() && !remoteSubdirSet.has(entry.name)) {
          await fs.promises.rm(path.join(localImagesDir, entry.name), { recursive: true, force: true });
        }
      }
    } catch { /* empty */ }

    return totalCount;
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
