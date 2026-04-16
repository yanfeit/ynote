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

  // ───── syncNotes() ─────

  describe('syncNotes()', () => {
    let tmpDir: string;
    let gitSync: GitSync;
    let syncDir: string;
    let localNotesDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-sync-test-'));
      syncDir = path.join(tmpDir, 'sync-repo');
      fs.mkdirSync(syncDir, { recursive: true });
      fs.mkdirSync(path.join(syncDir, '.git'), { recursive: true });
      localNotesDir = path.join(tmpDir, 'local-notes');
      fs.mkdirSync(localNotesDir, { recursive: true });
      const context = {
        globalStorageUri: { fsPath: tmpDir },
        subscriptions: [],
      };
      gitSync = new GitSync(context as any);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('copies local .md files to sync notes dir', async () => {
      fs.writeFileSync(path.join(localNotesDir, 'note1.md'), '---\nid: n1\n---\nContent');
      fs.writeFileSync(path.join(localNotesDir, 'note2.md'), '---\nid: n2\n---\nContent');

      const count = await gitSync.syncNotes(localNotesDir);
      assert.strictEqual(count, 2);

      const remoteNotesDir = path.join(syncDir, 'notes');
      assert.ok(fs.existsSync(path.join(remoteNotesDir, 'note1.md')));
      assert.ok(fs.existsSync(path.join(remoteNotesDir, 'note2.md')));
    });

    it('does not overwrite unchanged files', async () => {
      const remoteNotesDir = path.join(syncDir, 'notes');
      fs.mkdirSync(remoteNotesDir, { recursive: true });
      const content = '---\nid: n1\n---\nSame content';
      fs.writeFileSync(path.join(localNotesDir, 'note1.md'), content);
      fs.writeFileSync(path.join(remoteNotesDir, 'note1.md'), content);

      const count = await gitSync.syncNotes(localNotesDir);
      assert.strictEqual(count, 1);
      // File should still exist with same content
      const remoteContent = fs.readFileSync(path.join(remoteNotesDir, 'note1.md'), 'utf-8');
      assert.strictEqual(remoteContent, content);
    });

    it('overwrites changed files', async () => {
      const remoteNotesDir = path.join(syncDir, 'notes');
      fs.mkdirSync(remoteNotesDir, { recursive: true });
      fs.writeFileSync(path.join(localNotesDir, 'note1.md'), 'New content');
      fs.writeFileSync(path.join(remoteNotesDir, 'note1.md'), 'Old content');

      await gitSync.syncNotes(localNotesDir);
      const remoteContent = fs.readFileSync(path.join(remoteNotesDir, 'note1.md'), 'utf-8');
      assert.strictEqual(remoteContent, 'New content');
    });

    it('deletes remote files not in local', async () => {
      const remoteNotesDir = path.join(syncDir, 'notes');
      fs.mkdirSync(remoteNotesDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNotesDir, 'deleted.md'), 'Old note');
      fs.writeFileSync(path.join(localNotesDir, 'kept.md'), 'Kept note');

      await gitSync.syncNotes(localNotesDir);
      assert.ok(!fs.existsSync(path.join(remoteNotesDir, 'deleted.md')));
      assert.ok(fs.existsSync(path.join(remoteNotesDir, 'kept.md')));
    });

    it('returns 0 when local notes dir does not exist', async () => {
      fs.rmSync(localNotesDir, { recursive: true, force: true });
      const count = await gitSync.syncNotes(localNotesDir);
      assert.strictEqual(count, 0);
    });

    it('ignores non-.md files in local dir', async () => {
      fs.writeFileSync(path.join(localNotesDir, 'note.md'), 'content');
      fs.writeFileSync(path.join(localNotesDir, 'data.json'), '{}');

      const count = await gitSync.syncNotes(localNotesDir);
      assert.strictEqual(count, 1);
    });
  });

  // ───── pullNotes() ─────

  describe('pullNotes()', () => {
    let tmpDir: string;
    let gitSync: GitSync;
    let syncDir: string;
    let localNotesDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-sync-test-'));
      syncDir = path.join(tmpDir, 'sync-repo');
      fs.mkdirSync(syncDir, { recursive: true });
      fs.mkdirSync(path.join(syncDir, '.git'), { recursive: true });
      localNotesDir = path.join(tmpDir, 'local-notes');
      fs.mkdirSync(localNotesDir, { recursive: true });
      const context = {
        globalStorageUri: { fsPath: tmpDir },
        subscriptions: [],
      };
      gitSync = new GitSync(context as any);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('copies remote notes to local dir', async () => {
      const remoteNotesDir = path.join(syncDir, 'notes');
      fs.mkdirSync(remoteNotesDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNotesDir, 'note1.md'), 'Remote content 1');
      fs.writeFileSync(path.join(remoteNotesDir, 'note2.md'), 'Remote content 2');

      const count = await gitSync.pullNotes(localNotesDir);
      assert.strictEqual(count, 2);
      assert.strictEqual(fs.readFileSync(path.join(localNotesDir, 'note1.md'), 'utf-8'), 'Remote content 1');
      assert.strictEqual(fs.readFileSync(path.join(localNotesDir, 'note2.md'), 'utf-8'), 'Remote content 2');
    });

    it('deletes local files not in remote', async () => {
      const remoteNotesDir = path.join(syncDir, 'notes');
      fs.mkdirSync(remoteNotesDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNotesDir, 'keep.md'), 'keep');
      fs.writeFileSync(path.join(localNotesDir, 'keep.md'), 'old');
      fs.writeFileSync(path.join(localNotesDir, 'delete-me.md'), 'delete');

      await gitSync.pullNotes(localNotesDir);
      assert.ok(fs.existsSync(path.join(localNotesDir, 'keep.md')));
      assert.ok(!fs.existsSync(path.join(localNotesDir, 'delete-me.md')));
    });

    it('returns 0 when remote notes dir does not exist', async () => {
      const count = await gitSync.pullNotes(localNotesDir);
      assert.strictEqual(count, 0);
    });

    it('creates local dir if missing', async () => {
      fs.rmSync(localNotesDir, { recursive: true, force: true });
      const remoteNotesDir = path.join(syncDir, 'notes');
      fs.mkdirSync(remoteNotesDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNotesDir, 'note.md'), 'content');

      const count = await gitSync.pullNotes(localNotesDir);
      assert.strictEqual(count, 1);
      assert.ok(fs.existsSync(path.join(localNotesDir, 'note.md')));
    });
  });

  // ───── syncImages() ─────

  describe('syncImages()', () => {
    let tmpDir: string;
    let gitSync: GitSync;
    let syncDir: string;
    let localImagesDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-sync-test-'));
      syncDir = path.join(tmpDir, 'sync-repo');
      fs.mkdirSync(syncDir, { recursive: true });
      fs.mkdirSync(path.join(syncDir, '.git'), { recursive: true });
      localImagesDir = path.join(tmpDir, 'local-images');
      fs.mkdirSync(localImagesDir, { recursive: true });
      const context = {
        globalStorageUri: { fsPath: tmpDir },
        subscriptions: [],
      };
      gitSync = new GitSync(context as any);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('copies local image files to sync images dir', async () => {
      const noteDir = path.join(localImagesDir, 'note-id-1');
      fs.mkdirSync(noteDir, { recursive: true });
      fs.writeFileSync(path.join(noteDir, 'img1.png'), Buffer.from([0x89, 0x50]));
      fs.writeFileSync(path.join(noteDir, 'img2.jpg'), Buffer.from([0xFF, 0xD8]));

      const count = await gitSync.syncImages(localImagesDir);
      assert.strictEqual(count, 2);

      const remoteNoteDir = path.join(syncDir, 'images', 'note-id-1');
      assert.ok(fs.existsSync(path.join(remoteNoteDir, 'img1.png')));
      assert.ok(fs.existsSync(path.join(remoteNoteDir, 'img2.jpg')));
    });

    it('does not overwrite unchanged binary files', async () => {
      const noteDir = path.join(localImagesDir, 'note-id-1');
      fs.mkdirSync(noteDir, { recursive: true });
      const remoteNoteDir = path.join(syncDir, 'images', 'note-id-1');
      fs.mkdirSync(remoteNoteDir, { recursive: true });
      const data = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      fs.writeFileSync(path.join(noteDir, 'same.png'), data);
      fs.writeFileSync(path.join(remoteNoteDir, 'same.png'), data);

      const count = await gitSync.syncImages(localImagesDir);
      assert.strictEqual(count, 1);
      // Remote file should still be identical
      const remoteData = fs.readFileSync(path.join(remoteNoteDir, 'same.png'));
      assert.ok(remoteData.equals(data));
    });

    it('overwrites changed binary files', async () => {
      const noteDir = path.join(localImagesDir, 'note-id-1');
      fs.mkdirSync(noteDir, { recursive: true });
      const remoteNoteDir = path.join(syncDir, 'images', 'note-id-1');
      fs.mkdirSync(remoteNoteDir, { recursive: true });
      fs.writeFileSync(path.join(noteDir, 'img.png'), Buffer.from([0x01, 0x02]));
      fs.writeFileSync(path.join(remoteNoteDir, 'img.png'), Buffer.from([0x03, 0x04]));

      await gitSync.syncImages(localImagesDir);
      const remoteData = fs.readFileSync(path.join(remoteNoteDir, 'img.png'));
      assert.ok(remoteData.equals(Buffer.from([0x01, 0x02])));
    });

    it('deletes remote note directories not in local', async () => {
      const remoteNoteDir = path.join(syncDir, 'images', 'deleted-note');
      fs.mkdirSync(remoteNoteDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNoteDir, 'old.png'), 'old');

      const noteDir = path.join(localImagesDir, 'kept-note');
      fs.mkdirSync(noteDir, { recursive: true });
      fs.writeFileSync(path.join(noteDir, 'img.png'), 'new');

      await gitSync.syncImages(localImagesDir);
      assert.ok(!fs.existsSync(remoteNoteDir));
      assert.ok(fs.existsSync(path.join(syncDir, 'images', 'kept-note', 'img.png')));
    });

    it('returns 0 when local images dir does not exist', async () => {
      fs.rmSync(localImagesDir, { recursive: true, force: true });
      const count = await gitSync.syncImages(localImagesDir);
      assert.strictEqual(count, 0);
    });

    it('handles multiple note subdirectories', async () => {
      const dir1 = path.join(localImagesDir, 'note-1');
      const dir2 = path.join(localImagesDir, 'note-2');
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir1, 'a.png'), 'a');
      fs.writeFileSync(path.join(dir2, 'b.png'), 'b');
      fs.writeFileSync(path.join(dir2, 'c.png'), 'c');

      const count = await gitSync.syncImages(localImagesDir);
      assert.strictEqual(count, 3);
    });
  });

  // ───── pullImages() ─────

  describe('pullImages()', () => {
    let tmpDir: string;
    let gitSync: GitSync;
    let syncDir: string;
    let localImagesDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-sync-test-'));
      syncDir = path.join(tmpDir, 'sync-repo');
      fs.mkdirSync(syncDir, { recursive: true });
      fs.mkdirSync(path.join(syncDir, '.git'), { recursive: true });
      localImagesDir = path.join(tmpDir, 'local-images');
      fs.mkdirSync(localImagesDir, { recursive: true });
      const context = {
        globalStorageUri: { fsPath: tmpDir },
        subscriptions: [],
      };
      gitSync = new GitSync(context as any);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('copies remote images to local dir', async () => {
      const remoteNoteDir = path.join(syncDir, 'images', 'note-1');
      fs.mkdirSync(remoteNoteDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNoteDir, 'img.png'), Buffer.from([0x89, 0x50]));

      const count = await gitSync.pullImages(localImagesDir);
      assert.strictEqual(count, 1);
      const localData = fs.readFileSync(path.join(localImagesDir, 'note-1', 'img.png'));
      assert.ok(localData.equals(Buffer.from([0x89, 0x50])));
    });

    it('deletes local note directories not in remote', async () => {
      const localNoteDir = path.join(localImagesDir, 'deleted-note');
      fs.mkdirSync(localNoteDir, { recursive: true });
      fs.writeFileSync(path.join(localNoteDir, 'img.png'), 'old');

      const remoteNoteDir = path.join(syncDir, 'images', 'kept-note');
      fs.mkdirSync(remoteNoteDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNoteDir, 'img.png'), 'new');

      await gitSync.pullImages(localImagesDir);
      assert.ok(!fs.existsSync(localNoteDir));
      assert.ok(fs.existsSync(path.join(localImagesDir, 'kept-note', 'img.png')));
    });

    it('returns 0 when remote images dir does not exist', async () => {
      const count = await gitSync.pullImages(localImagesDir);
      assert.strictEqual(count, 0);
    });

    it('creates local dir if missing', async () => {
      fs.rmSync(localImagesDir, { recursive: true, force: true });
      const remoteNoteDir = path.join(syncDir, 'images', 'note-1');
      fs.mkdirSync(remoteNoteDir, { recursive: true });
      fs.writeFileSync(path.join(remoteNoteDir, 'img.png'), 'data');

      const count = await gitSync.pullImages(localImagesDir);
      assert.strictEqual(count, 1);
      assert.ok(fs.existsSync(path.join(localImagesDir, 'note-1', 'img.png')));
    });

    it('handles multiple note subdirectories', async () => {
      const dir1 = path.join(syncDir, 'images', 'note-1');
      const dir2 = path.join(syncDir, 'images', 'note-2');
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir1, 'a.png'), 'a');
      fs.writeFileSync(path.join(dir2, 'b.png'), 'b');

      const count = await gitSync.pullImages(localImagesDir);
      assert.strictEqual(count, 2);
    });
  });
});
