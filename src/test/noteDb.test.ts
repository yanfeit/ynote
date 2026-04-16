import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NoteDb } from '../database/noteDb';

function createTestContext(): { context: any; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-note-test-'));
  const context = {
    globalStorageUri: { fsPath: tmpDir },
    subscriptions: [],
  };
  return { context, tmpDir };
}

describe('NoteDb', () => {
  let noteDb: NoteDb;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createTestContext();
    noteDb = new NoteDb(ctx.context as any);
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getAll()', () => {
    it('returns empty array when no notes exist', async () => {
      const notes = await noteDb.getAll();
      assert.deepStrictEqual(notes, []);
    });

    it('returns notes sorted by updatedAt descending', async () => {
      const n1 = await noteDb.add('Older Note');
      // Force updatedAt to an old date by rewriting the file
      let content1 = fs.readFileSync(n1.filePath, 'utf-8');
      content1 = content1.replace(/updatedAt: .+/, 'updatedAt: 2024-01-01T00:00:00.000Z');
      fs.writeFileSync(n1.filePath, content1, 'utf-8');

      await noteDb.add('Newer Note');

      const all = await noteDb.getAll();
      assert.strictEqual(all.length, 2);
      assert.strictEqual(all[0].title, 'Newer Note');
      assert.strictEqual(all[1].title, 'Older Note');
    });
  });

  describe('add()', () => {
    it('creates a note with correct front matter', async () => {
      const note = await noteDb.add('My First Note', ['ai', 'llm']);
      assert.ok(note.id);
      assert.strictEqual(note.title, 'My First Note');
      assert.deepStrictEqual(note.tags, ['ai', 'llm']);
      assert.ok(note.createdAt);
      assert.ok(note.updatedAt);
      assert.ok(note.filePath.endsWith('.md'));
    });

    it('writes a valid .md file to disk', async () => {
      const note = await noteDb.add('Disk Check');
      assert.ok(fs.existsSync(note.filePath));

      const content = fs.readFileSync(note.filePath, 'utf-8');
      assert.ok(content.startsWith('---\n'));
      assert.ok(content.includes('title: Disk Check'));
      assert.ok(content.includes(`id: ${note.id}`));
      assert.ok(content.includes('# Disk Check'));
    });

    it('writes tags as YAML array', async () => {
      const note = await noteDb.add('Tagged Note', ['tag1', 'tag2']);
      const content = fs.readFileSync(note.filePath, 'utf-8');
      assert.ok(content.includes('  - tag1'));
      assert.ok(content.includes('  - tag2'));
    });

    it('handles empty tags', async () => {
      const note = await noteDb.add('No Tags');
      assert.deepStrictEqual(note.tags, []);
    });

    it('handles concurrent add operations', async () => {
      const tasks: Array<Promise<any>> = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(noteDb.add(`Concurrent Note ${i}`));
      }
      await Promise.all(tasks);
      const all = await noteDb.getAll();
      assert.strictEqual(all.length, 5);
    });
  });

  describe('remove()', () => {
    it('removes a note by deleting its file', async () => {
      const note = await noteDb.add('To Remove');
      await noteDb.remove(note.id);
      const all = await noteDb.getAll();
      assert.strictEqual(all.length, 0);
      assert.ok(!fs.existsSync(note.filePath));
    });

    it('throws when note not found', async () => {
      await assert.rejects(
        () => noteDb.remove('nonexistent-id'),
        /Note not found/
      );
    });
  });

  describe('updateMetadata()', () => {
    it('updates title in front matter', async () => {
      const note = await noteDb.add('Old Title');
      await noteDb.updateMetadata(note.id, { title: 'New Title' });
      const updated = await noteDb.findById(note.id);
      assert.ok(updated);
      assert.strictEqual(updated!.title, 'New Title');
    });

    it('updates tags in front matter', async () => {
      const note = await noteDb.add('Tag Update', ['old-tag']);
      await noteDb.updateMetadata(note.id, { tags: ['new-tag1', 'new-tag2'] });
      const updated = await noteDb.findById(note.id);
      assert.ok(updated);
      assert.deepStrictEqual(updated!.tags, ['new-tag1', 'new-tag2']);
    });

    it('updates updatedAt timestamp', async () => {
      const note = await noteDb.add('Timestamp Test');
      const originalUpdated = note.updatedAt;
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      await noteDb.updateMetadata(note.id, { title: 'Changed' });
      const updated = await noteDb.findById(note.id);
      assert.ok(updated);
      assert.notStrictEqual(updated!.updatedAt, originalUpdated);
    });

    it('preserves body content', async () => {
      const note = await noteDb.add('Body Preserve');
      // Write custom body
      let content = fs.readFileSync(note.filePath, 'utf-8');
      content = content.replace('# Body Preserve\n\n', '# Body Preserve\n\nSome important content here.\n');
      fs.writeFileSync(note.filePath, content, 'utf-8');

      await noteDb.updateMetadata(note.id, { title: 'Body Preserve Updated' });

      // After rename, find the file by ID
      const updated = await noteDb.findById(note.id);
      assert.ok(updated);
      const rawContent = fs.readFileSync(updated!.filePath, 'utf-8');
      assert.ok(rawContent.includes('Some important content here.'));
      assert.ok(rawContent.includes('title: Body Preserve Updated'));
    });

    it('throws when note not found', async () => {
      await assert.rejects(
        () => noteDb.updateMetadata('nonexistent', { title: 'X' }),
        /Note not found/
      );
    });
  });

  describe('touchUpdatedAt()', () => {
    it('updates only the updatedAt field', async () => {
      const note = await noteDb.add('Touch Test', ['tag1']);
      await new Promise(resolve => setTimeout(resolve, 10));
      await noteDb.touchUpdatedAt(note.id);
      const updated = await noteDb.findById(note.id);
      assert.ok(updated);
      assert.strictEqual(updated!.title, 'Touch Test');
      assert.deepStrictEqual(updated!.tags, ['tag1']);
      assert.notStrictEqual(updated!.updatedAt, note.updatedAt);
    });
  });

  describe('findById()', () => {
    it('finds a note by ID', async () => {
      const note = await noteDb.add('Find Me');
      const found = await noteDb.findById(note.id);
      assert.ok(found);
      assert.strictEqual(found!.id, note.id);
      assert.strictEqual(found!.title, 'Find Me');
    });

    it('returns undefined when not found', async () => {
      const found = await noteDb.findById('nonexistent');
      assert.strictEqual(found, undefined);
    });
  });

  describe('getAllTags()', () => {
    it('returns empty array when no notes', async () => {
      const tags = await noteDb.getAllTags();
      assert.deepStrictEqual(tags, []);
    });

    it('returns unique tags sorted by frequency', async () => {
      await noteDb.add('Note 1', ['ai', 'llm']);
      await noteDb.add('Note 2', ['ai', 'coding']);
      await noteDb.add('Note 3', ['ai']);
      const tags = await noteDb.getAllTags();
      assert.strictEqual(tags[0], 'ai'); // most frequent
      assert.ok(tags.includes('llm'));
      assert.ok(tags.includes('coding'));
    });
  });

  describe('front matter parsing robustness', () => {
    it('handles file without front matter gracefully', async () => {
      // Write a file with no front matter directly to the notes directory
      const notesDir = noteDb.getNotesDir();
      fs.mkdirSync(notesDir, { recursive: true });
      const filePath = path.join(notesDir, 'corrupt.md');
      fs.writeFileSync(filePath, '# No front matter\n\nJust content.', 'utf-8');

      const all = await noteDb.getAll();
      // Should skip the corrupt file
      assert.strictEqual(all.length, 0);
    });

    it('handles file with missing required fields', async () => {
      // Write a file with incomplete front matter
      const notesDir = noteDb.getNotesDir();
      fs.mkdirSync(notesDir, { recursive: true });
      const filePath = path.join(notesDir, 'missing-fields.md');
      fs.writeFileSync(filePath, '---\nid: some-id\n---\nContent', 'utf-8');

      const all = await noteDb.getAll();
      // title is required, so this should be skipped
      assert.strictEqual(all.length, 0);
    });

    it('normalizes invalid timestamps to epoch', async () => {
      const note = await noteDb.add('Bad Dates');
      let content = fs.readFileSync(note.filePath, 'utf-8');
      content = content.replace(/createdAt: .+/, 'createdAt: bad-date');
      content = content.replace(/updatedAt: .+/, 'updatedAt: also-bad');
      fs.writeFileSync(note.filePath, content, 'utf-8');

      const all = await noteDb.getAll();
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0].createdAt, '1970-01-01T00:00:00.000Z');
      assert.strictEqual(all[0].updatedAt, '1970-01-01T00:00:00.000Z');
    });

    it('skips non-.md files in notes directory', async () => {
      await noteDb.add('Real Note');
      const notesDir = noteDb.getNotesDir();
      fs.writeFileSync(path.join(notesDir, 'random.txt'), 'not a note', 'utf-8');

      const all = await noteDb.getAll();
      assert.strictEqual(all.length, 1);
    });
  });

  describe('getNotePath() and getNotesDir()', () => {
    it('returns correct path for a note', () => {
      const notePath = noteDb.getNotePath('test-id');
      assert.ok(notePath.endsWith('test-id.md'));
      assert.ok(notePath.includes('notes'));
    });

    it('returns the notes directory path', () => {
      const dir = noteDb.getNotesDir();
      assert.ok(dir.endsWith('notes'));
    });
  });
});
