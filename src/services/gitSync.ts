import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

  async sync(dbPath: string): Promise<string> {
    const repoUrl = this.getRepoUrl();
    if (!repoUrl) {
      throw new Error('GitHub repo URL not configured. Set ynote.githubRepoUrl in settings.');
    }

    // Ensure repo is set up
    if (!(await this.isSetup())) {
      await this.setup();
    }

    const syncDbPath = path.join(this.syncDir, 'readings.json');

    // Pull latest from remote first
    try {
      await this.git(['pull', '--rebase', 'origin', 'main']);
    } catch {
      // Might fail if no remote commits yet or branch doesn't exist; that's okay
      try {
        await this.git(['pull', '--rebase', 'origin', 'master']);
      } catch {
        // First push scenario — no remote branch yet
      }
    }

    // Merge: if remote has a readings.json, merge with local
    const localReadings = await this.readJsonSafe(dbPath);
    const remoteReadings = await this.readJsonSafe(syncDbPath);
    const merged = this.mergeReadings(localReadings, remoteReadings);

    // Write merged data to both locations
    const mergedJson = JSON.stringify(merged, null, 2);
    await fs.promises.writeFile(syncDbPath, mergedJson, 'utf-8');
    await fs.promises.writeFile(dbPath, mergedJson, 'utf-8');

    // Commit and push
    await this.git(['add', 'readings.json']);

    try {
      const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.git(['commit', '-m', `sync readings ${date}`]);
    } catch {
      // Nothing to commit
      return 'Already up to date.';
    }

    await this.git(['push', 'origin', 'HEAD']);
    return `Synced ${merged.length} readings to GitHub.`;
  }

  private async readJsonSafe(filePath: string): Promise<Array<Record<string, unknown>>> {
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private mergeReadings(
    local: Array<Record<string, unknown>>,
    remote: Array<Record<string, unknown>>
  ): Array<Record<string, unknown>> {
    const byId = new Map<string, Record<string, unknown>>();

    // Add remote first
    for (const r of remote) {
      if (r.id && typeof r.id === 'string') {
        byId.set(r.id, r);
      }
    }

    // Local overwrites remote if updatedAt is newer
    for (const r of local) {
      if (r.id && typeof r.id === 'string') {
        const existing = byId.get(r.id);
        if (!existing) {
          byId.set(r.id, r);
        } else {
          const localDate = new Date(r.updatedAt as string || r.addedAt as string).getTime();
          const remoteDate = new Date(existing.updatedAt as string || existing.addedAt as string).getTime();
          if (localDate >= remoteDate) {
            byId.set(r.id, r);
          }
        }
      }
    }

    // Sort newest first
    return Array.from(byId.values()).sort((a, b) => {
      const da = new Date(a.addedAt as string).getTime();
      const db = new Date(b.addedAt as string).getTime();
      return db - da;
    });
  }
}
