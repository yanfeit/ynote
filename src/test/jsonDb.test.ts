import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JsonDb } from '../database/jsonDb';
import { Reading } from '../models/reading';

// Create a fake ExtensionContext that points to a temp directory
function createTestContext(): { context: any; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-test-'));
  const context = {
    globalStorageUri: { fsPath: tmpDir },
    subscriptions: [],
  };
  return { context, tmpDir };
}

function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: overrides.id || 'test-id-1',
    url: overrides.url || 'https://example.com/article',
    title: overrides.title || 'Test Article',
    author: overrides.author || 'Test Author',
    organization: overrides.organization || 'Test Org',
    abstract: overrides.abstract || 'A test abstract.',
    addedAt: overrides.addedAt || '2026-03-30T12:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-30T12:00:00.000Z',
    tags: overrides.tags || [],
    source: overrides.source || 'example.com',
  };
}

describe('JsonDb', () => {
  let db: JsonDb;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createTestContext();
    db = new JsonDb(ctx.context as any);
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getAll()', () => {
    it('returns empty array when no database file exists', async () => {
      const readings = await db.getAll();
      assert.deepStrictEqual(readings, []);
    });

    it('returns readings sorted newest-first', async () => {
      const older = makeReading({ id: '1', addedAt: '2026-03-01T00:00:00.000Z', url: 'https://a.com' });
      const newer = makeReading({ id: '2', addedAt: '2026-03-30T00:00:00.000Z', url: 'https://b.com' });
      await db.add(older);
      await db.add(newer);
      const all = await db.getAll();
      assert.strictEqual(all.length, 2);
      assert.strictEqual(all[0].id, '2'); // newer first
      assert.strictEqual(all[1].id, '1');
    });
  });

  describe('add()', () => {
    it('adds a reading to an empty database', async () => {
      const reading = makeReading();
      await db.add(reading);
      const all = await db.getAll();
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0].title, 'Test Article');
    });

    it('creates the readings.json file on disk', async () => {
      await db.add(makeReading());
      const filePath = db.getDbPath();
      assert.ok(fs.existsSync(filePath), 'readings.json should exist');
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.strictEqual(raw.length, 1);
    });

    it('rejects duplicate URLs', async () => {
      await db.add(makeReading({ id: '1', url: 'https://dup.com' }));
      await assert.rejects(
        () => db.add(makeReading({ id: '2', url: 'https://dup.com' })),
        /already exists/
      );
    });
  });

  describe('remove()', () => {
    it('removes a reading by id', async () => {
      await db.add(makeReading({ id: 'to-remove' }));
      await db.remove('to-remove');
      const all = await db.getAll();
      assert.strictEqual(all.length, 0);
    });

    it('throws when id not found', async () => {
      await assert.rejects(
        () => db.remove('nonexistent'),
        /not found/
      );
    });
  });

  describe('update()', () => {
    it('updates fields on an existing reading', async () => {
      await db.add(makeReading({ id: 'upd' }));
      await db.update('upd', { title: 'Updated Title' });
      const all = await db.getAll();
      assert.strictEqual(all[0].title, 'Updated Title');
    });

    it('sets updatedAt on update', async () => {
      await db.add(makeReading({ id: 'upd', updatedAt: '2026-01-01T00:00:00.000Z' }));
      await db.update('upd', { title: 'New' });
      const all = await db.getAll();
      assert.notStrictEqual(all[0].updatedAt, '2026-01-01T00:00:00.000Z');
    });

    it('throws when id not found', async () => {
      await assert.rejects(
        () => db.update('nonexistent', { title: 'X' }),
        /not found/
      );
    });
  });

  describe('findByUrl()', () => {
    it('finds a reading by URL', async () => {
      await db.add(makeReading({ url: 'https://find.me' }));
      const found = await db.findByUrl('https://find.me');
      assert.ok(found);
      assert.strictEqual(found!.url, 'https://find.me');
    });

    it('returns undefined when URL not found', async () => {
      const found = await db.findByUrl('https://nope.com');
      assert.strictEqual(found, undefined);
    });
  });
});
