import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Module from 'module';

// Mock vscode module before importing GitSync
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return require('./mock/vscode');
  }
  return originalRequire.apply(this, arguments as any);
};

import { GitSync, SyncDiff } from '../services/gitSync';

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: overrides.id || 'entry-1',
    url: overrides.url || 'https://example.com/article',
    title: overrides.title || 'Test Article',
    author: overrides.author || 'Test Author',
    organization: overrides.organization || 'Test Org',
    abstract: overrides.abstract || 'A test abstract.',
    addedAt: overrides.addedAt || '2026-03-30T12:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-30T12:00:00.000Z',
    tags: overrides.tags || [],
    source: overrides.source || 'example.com',
    comment: overrides.comment ?? '',
  };
}

describe('GitSync', () => {

  // ───── computeDiff() ─────

  describe('computeDiff()', () => {
    it('returns empty diff when local and remote are identical', () => {
      const entries = [makeEntry({ id: '1' }), makeEntry({ id: '2', url: 'https://b.com' })];
      const diff = GitSync.computeDiff(entries, [...entries]);
      assert.strictEqual(diff.toWrite.length, 0);
      assert.strictEqual(diff.toDelete.length, 0);
    });

    it('detects new local entries not in remote', () => {
      const local = [makeEntry({ id: '1' }), makeEntry({ id: '2', url: 'https://b.com' })];
      const remote = [makeEntry({ id: '1' })];
      const diff = GitSync.computeDiff(local, remote);
      assert.strictEqual(diff.toWrite.length, 1);
      assert.strictEqual(diff.toWrite[0].id, '2');
      assert.strictEqual(diff.toDelete.length, 0);
    });

    it('detects entries deleted locally (in remote but not local)', () => {
      const local = [makeEntry({ id: '1' })];
      const remote = [makeEntry({ id: '1' }), makeEntry({ id: '2', url: 'https://b.com' })];
      const diff = GitSync.computeDiff(local, remote);
      assert.strictEqual(diff.toWrite.length, 0);
      assert.strictEqual(diff.toDelete.length, 1);
      assert.strictEqual(diff.toDelete[0], '2');
    });

    it('detects modified local entries', () => {
      const local = [makeEntry({ id: '1', title: 'Updated Title' })];
      const remote = [makeEntry({ id: '1', title: 'Old Title' })];
      const diff = GitSync.computeDiff(local, remote);
      assert.strictEqual(diff.toWrite.length, 1);
      assert.strictEqual(diff.toWrite[0].title, 'Updated Title');
      assert.strictEqual(diff.toDelete.length, 0);
    });

    it('handles empty local — all entries deleted', () => {
      const remote = [makeEntry({ id: '1' }), makeEntry({ id: '2', url: 'https://b.com' })];
      const diff = GitSync.computeDiff([], remote);
      assert.strictEqual(diff.toWrite.length, 0);
      assert.strictEqual(diff.toDelete.length, 2);
    });

    it('handles empty remote — all entries are new', () => {
      const local = [makeEntry({ id: '1' }), makeEntry({ id: '2', url: 'https://b.com' })];
      const diff = GitSync.computeDiff(local, []);
      assert.strictEqual(diff.toWrite.length, 2);
      assert.strictEqual(diff.toDelete.length, 0);
    });

    it('handles both empty', () => {
      const diff = GitSync.computeDiff([], []);
      assert.strictEqual(diff.toWrite.length, 0);
      assert.strictEqual(diff.toDelete.length, 0);
    });

    it('handles mixed: additions, modifications, and deletions', () => {
      const local = [
        makeEntry({ id: '1', title: 'Same' }),
        makeEntry({ id: '2', title: 'Modified', url: 'https://b.com' }),
        makeEntry({ id: '4', url: 'https://d.com' }),
      ];
      const remote = [
        makeEntry({ id: '1', title: 'Same' }),
        makeEntry({ id: '2', title: 'Original', url: 'https://b.com' }),
        makeEntry({ id: '3', url: 'https://c.com' }),
      ];
      const diff = GitSync.computeDiff(local, remote);
      assert.strictEqual(diff.toWrite.length, 2); // id=2 (modified) + id=4 (new)
      assert.strictEqual(diff.toDelete.length, 1); // id=3
      assert.strictEqual(diff.toDelete[0], '3');
      const writtenIds = diff.toWrite.map(e => e.id).sort();
      assert.deepStrictEqual(writtenIds, ['2', '4']);
    });

    it('push after deleting all local entries produces correct diff', () => {
      const remote = [
        makeEntry({ id: 'a' }),
        makeEntry({ id: 'b', url: 'https://b.com' }),
        makeEntry({ id: 'c', url: 'https://c.com' }),
      ];
      const diff = GitSync.computeDiff([], remote);
      assert.strictEqual(diff.toWrite.length, 0);
      assert.strictEqual(diff.toDelete.length, 3);
      assert.deepStrictEqual(diff.toDelete.sort(), ['a', 'b', 'c']);
    });

    it('skips entries without string id', () => {
      const local = [{ title: 'no id' } as Record<string, unknown>];
      const remote = [{ id: 123, title: 'numeric id' } as Record<string, unknown>];
      const diff = GitSync.computeDiff(local, remote);
      assert.strictEqual(diff.toWrite.length, 0);
      assert.strictEqual(diff.toDelete.length, 0);
    });

    it('skips entries with unsafe string ids', () => {
      const local = [{ id: '../escape', title: 'bad id' } as Record<string, unknown>];
      const remote = [{ id: '../../remote', title: 'bad remote id' } as Record<string, unknown>];
      const diff = GitSync.computeDiff(local, remote);
      assert.strictEqual(diff.toWrite.length, 0);
      assert.strictEqual(diff.toDelete.length, 0);
    });
  });

  // ───── migrateFromSingleFile() ─────

  describe('migrateFromSingleFile()', () => {
    let tmpDir: string;
    let gitSync: GitSync;
    let syncDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-sync-test-'));
      syncDir = path.join(tmpDir, 'sync-repo');
      fs.mkdirSync(syncDir, { recursive: true });
      fs.mkdirSync(path.join(syncDir, '.git'), { recursive: true });
      const context = {
        globalStorageUri: { fsPath: tmpDir },
        subscriptions: [],
      };
      gitSync = new GitSync(context as any);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('migrates readings.json to individual files', async () => {
      const entries = [
        makeEntry({ id: 'a1' }),
        makeEntry({ id: 'b2', url: 'https://b.com' }),
      ];
      fs.writeFileSync(path.join(syncDir, 'readings.json'), JSON.stringify(entries, null, 2));

      await gitSync.migrateFromSingleFile();

      const readingsDir = path.join(syncDir, 'readings');
      assert.ok(fs.existsSync(path.join(readingsDir, 'a1.json')));
      assert.ok(fs.existsSync(path.join(readingsDir, 'b2.json')));
      assert.ok(!fs.existsSync(path.join(syncDir, 'readings.json')), 'Old file should be deleted');

      const a1 = JSON.parse(fs.readFileSync(path.join(readingsDir, 'a1.json'), 'utf-8'));
      assert.strictEqual(a1.id, 'a1');
    });

    it('does nothing when no readings.json exists', async () => {
      await gitSync.migrateFromSingleFile();
      assert.ok(!fs.existsSync(path.join(syncDir, 'readings')));
    });

    it('does not overwrite existing individual files', async () => {
      const readingsDir = path.join(syncDir, 'readings');
      fs.mkdirSync(readingsDir, { recursive: true });
      // Write a newer individual file first
      const newerEntry = makeEntry({ id: 'a1', title: 'Newer Version' });
      fs.writeFileSync(path.join(readingsDir, 'a1.json'), JSON.stringify(newerEntry, null, 2));

      // Old readings.json has an older version
      const entries = [makeEntry({ id: 'a1', title: 'Old Version' })];
      fs.writeFileSync(path.join(syncDir, 'readings.json'), JSON.stringify(entries, null, 2));

      await gitSync.migrateFromSingleFile();

      const a1 = JSON.parse(fs.readFileSync(path.join(readingsDir, 'a1.json'), 'utf-8'));
      assert.strictEqual(a1.title, 'Newer Version');
    });
  });

  // ───── readIndividualFiles() ─────

  describe('readIndividualFiles()', () => {
    let tmpDir: string;
    let gitSync: GitSync;
    let syncDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-sync-test-'));
      syncDir = path.join(tmpDir, 'sync-repo');
      fs.mkdirSync(syncDir, { recursive: true });
      fs.mkdirSync(path.join(syncDir, '.git'), { recursive: true });
      const context = {
        globalStorageUri: { fsPath: tmpDir },
        subscriptions: [],
      };
      gitSync = new GitSync(context as any);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads individual files from readings directory', async () => {
      const readingsDir = path.join(syncDir, 'readings');
      fs.mkdirSync(readingsDir, { recursive: true });
      fs.writeFileSync(path.join(readingsDir, 'e1.json'), JSON.stringify(makeEntry({ id: 'e1' })));
      fs.writeFileSync(path.join(readingsDir, 'e2.json'), JSON.stringify(makeEntry({ id: 'e2', url: 'https://b.com' })));

      const readings = await gitSync.readIndividualFiles();
      assert.strictEqual(readings.length, 2);
    });

    it('returns empty array when directory does not exist', async () => {
      const readings = await gitSync.readIndividualFiles();
      assert.strictEqual(readings.length, 0);
    });

    it('skips invalid JSON files', async () => {
      const readingsDir = path.join(syncDir, 'readings');
      fs.mkdirSync(readingsDir, { recursive: true });
      fs.writeFileSync(path.join(readingsDir, 'good.json'), JSON.stringify(makeEntry({ id: 'good' })));
      fs.writeFileSync(path.join(readingsDir, 'bad.json'), 'not json');

      const readings = await gitSync.readIndividualFiles();
      assert.strictEqual(readings.length, 1);
      assert.strictEqual(readings[0].id, 'good');
    });

    it('skips non-JSON files', async () => {
      const readingsDir = path.join(syncDir, 'readings');
      fs.mkdirSync(readingsDir, { recursive: true });
      fs.writeFileSync(path.join(readingsDir, 'e1.json'), JSON.stringify(makeEntry({ id: 'e1' })));
      fs.writeFileSync(path.join(readingsDir, 'README.md'), '# notes');

      const readings = await gitSync.readIndividualFiles();
      assert.strictEqual(readings.length, 1);
    });
  });
});
