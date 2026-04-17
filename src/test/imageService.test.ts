import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Module from 'module';

// Mock vscode module before importing ImageService
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return require('./mock/vscode');
  }
  return originalRequire.apply(this, arguments as any);
};

import { ImageService, sanitizeFilename, formatTimestamp, IMAGE_EXTENSIONS } from '../services/imageService';

function createTestContext(): { context: any; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ynote-image-test-'));
  const context = {
    globalStorageUri: { fsPath: tmpDir },
    subscriptions: [],
  };
  return { context, tmpDir };
}

const VALID_NOTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_NOTE_ID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

describe('ImageService', () => {
  let imageService: ImageService;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createTestContext();
    imageService = new ImageService(ctx.context as any);
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ───── sanitizeFilename() ─────

  describe('sanitizeFilename()', () => {
    it('replaces disallowed characters with dashes', () => {
      assert.strictEqual(sanitizeFilename('my/file:name*test'), 'my-file-name-test');
    });

    it('replaces whitespace with dashes', () => {
      assert.strictEqual(sanitizeFilename('my file  name'), 'my-file-name');
    });

    it('collapses consecutive dashes', () => {
      assert.strictEqual(sanitizeFilename('a---b'), 'a-b');
    });

    it('trims leading and trailing dashes', () => {
      assert.strictEqual(sanitizeFilename('---hello---'), 'hello');
    });

    it('truncates to 80 characters', () => {
      const longName = 'a'.repeat(120);
      assert.ok(sanitizeFilename(longName).length <= 80);
    });

    it('returns "image" for empty input', () => {
      assert.strictEqual(sanitizeFilename(''), 'image');
    });
  });

  // ───── formatTimestamp() ─────

  describe('formatTimestamp()', () => {
    it('formats date as YYYYMMDD-HHmmss', () => {
      const date = new Date('2026-04-16T14:30:45Z');
      const result = formatTimestamp(date);
      // Note: output depends on local timezone, so just check format
      assert.ok(/^\d{8}-\d{6}$/.test(result), `Expected YYYYMMDD-HHmmss format, got: ${result}`);
    });
  });

  // ───── generateFilename() ─────

  describe('generateFilename()', () => {
    it('generates paste filename without original name', () => {
      const filename = imageService.generateFilename(undefined, '.png');
      assert.ok(filename.startsWith('paste-'), `Expected paste- prefix, got: ${filename}`);
      assert.ok(filename.endsWith('.png'));
    });

    it('generates timestamped filename with original name', () => {
      const filename = imageService.generateFilename('screenshot', '.png');
      assert.ok(/^\d{8}-\d{6}-screenshot\.png$/.test(filename), `Got: ${filename}`);
    });

    it('sanitizes original name in generated filename', () => {
      const filename = imageService.generateFilename('my file/image', '.jpg');
      assert.ok(filename.includes('my-file-image'), `Got: ${filename}`);
      assert.ok(filename.endsWith('.jpg'));
    });

    it('defaults to .png when no extension provided', () => {
      const filename = imageService.generateFilename();
      assert.ok(filename.endsWith('.png'));
    });
  });

  // ───── getImagesDir() ─────

  describe('getImagesDir()', () => {
    it('returns path with noteId subdirectory', () => {
      const dir = imageService.getImagesDir(VALID_NOTE_ID);
      assert.ok(dir.endsWith(path.join('images', VALID_NOTE_ID)));
    });

    it('throws for invalid note ID', () => {
      assert.throws(() => imageService.getImagesDir('invalid-id'), /Invalid note ID/);
    });

    it('throws for path traversal attempts', () => {
      assert.throws(() => imageService.getImagesDir('../../../etc'), /Invalid note ID/);
    });
  });

  // ───── getRelativePath() ─────

  describe('getRelativePath()', () => {
    it('returns correct relative path', () => {
      const relPath = imageService.getRelativePath(VALID_NOTE_ID, 'test.png');
      assert.strictEqual(relPath, `images/${VALID_NOTE_ID}/test.png`);
    });

    it('throws for invalid note ID', () => {
      assert.throws(() => imageService.getRelativePath('bad', 'test.png'), /Invalid note ID/);
    });
  });

  // ───── saveLocalImage() ─────

  describe('saveLocalImage()', () => {
    it('copies image file to note directory', async () => {
      // Create a fake source image
      const sourceDir = path.join(tmpDir, 'source');
      fs.mkdirSync(sourceDir, { recursive: true });
      const sourcePath = path.join(sourceDir, 'photo.png');
      fs.writeFileSync(sourcePath, Buffer.from([0x89, 0x50, 0x4E, 0x47])); // PNG header

      const filename = await imageService.saveLocalImage(VALID_NOTE_ID, sourcePath);

      assert.ok(filename.endsWith('.png'));
      assert.ok(filename.includes('photo'));

      const savedPath = path.join(imageService.getImagesDir(VALID_NOTE_ID), filename);
      assert.ok(fs.existsSync(savedPath));

      const savedContent = fs.readFileSync(savedPath);
      const sourceContent = fs.readFileSync(sourcePath);
      assert.ok(savedContent.equals(sourceContent));
    });

    it('creates note image directory if missing', async () => {
      const sourceDir = path.join(tmpDir, 'source');
      fs.mkdirSync(sourceDir, { recursive: true });
      const sourcePath = path.join(sourceDir, 'test.jpg');
      fs.writeFileSync(sourcePath, Buffer.from([0xFF, 0xD8, 0xFF]));

      await imageService.saveLocalImage(VALID_NOTE_ID, sourcePath);

      assert.ok(fs.existsSync(imageService.getImagesDir(VALID_NOTE_ID)));
    });

    it('rejects non-image file extensions', async () => {
      const sourcePath = path.join(tmpDir, 'malware.exe');
      fs.writeFileSync(sourcePath, 'not an image');

      await assert.rejects(
        () => imageService.saveLocalImage(VALID_NOTE_ID, sourcePath),
        /Unsupported image format/
      );
    });

    it('rejects invalid note ID', async () => {
      const sourcePath = path.join(tmpDir, 'test.png');
      fs.writeFileSync(sourcePath, Buffer.from([0x89, 0x50]));

      await assert.rejects(
        () => imageService.saveLocalImage('not-a-uuid', sourcePath),
        /Invalid note ID/
      );
    });
  });

  // ───── saveImageBuffer() ─────

  describe('saveImageBuffer()', () => {
    it('writes buffer to file', async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);

      const filename = await imageService.saveImageBuffer(VALID_NOTE_ID, buffer, undefined, '.png');

      assert.ok(filename.startsWith('paste-'));
      assert.ok(filename.endsWith('.png'));

      const savedPath = path.join(imageService.getImagesDir(VALID_NOTE_ID), filename);
      assert.ok(fs.existsSync(savedPath));
      const savedContent = fs.readFileSync(savedPath);
      assert.ok(savedContent.equals(buffer));
    });

    it('writes buffer with original name', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF]);

      const filename = await imageService.saveImageBuffer(VALID_NOTE_ID, buffer, 'photo', '.jpg');

      assert.ok(filename.includes('photo'));
      assert.ok(filename.endsWith('.jpg'));
    });

    it('accepts Uint8Array', async () => {
      const data = new Uint8Array([0x89, 0x50, 0x4E]);

      const filename = await imageService.saveImageBuffer(VALID_NOTE_ID, data, undefined, '.png');

      const savedPath = path.join(imageService.getImagesDir(VALID_NOTE_ID), filename);
      assert.ok(fs.existsSync(savedPath));
    });

    it('handles extension without leading dot', async () => {
      const buffer = Buffer.from([0x00]);

      const filename = await imageService.saveImageBuffer(VALID_NOTE_ID, buffer, undefined, 'png');
      assert.ok(filename.endsWith('.png'));
    });
  });

  // ───── deleteNoteImages() ─────

  describe('deleteNoteImages()', () => {
    it('deletes note image directory and contents', async () => {
      const dir = imageService.getImagesDir(VALID_NOTE_ID);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'img1.png'), 'data1');
      fs.writeFileSync(path.join(dir, 'img2.jpg'), 'data2');

      await imageService.deleteNoteImages(VALID_NOTE_ID);

      assert.ok(!fs.existsSync(dir));
    });

    it('does not throw when directory does not exist', async () => {
      // Should not throw
      await imageService.deleteNoteImages(VALID_NOTE_ID);
    });

    it('does not affect other note directories', async () => {
      const dir1 = imageService.getImagesDir(VALID_NOTE_ID);
      const dir2 = imageService.getImagesDir(VALID_NOTE_ID_2);
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir1, 'img.png'), 'data');
      fs.writeFileSync(path.join(dir2, 'img.png'), 'data');

      await imageService.deleteNoteImages(VALID_NOTE_ID);

      assert.ok(!fs.existsSync(dir1));
      assert.ok(fs.existsSync(dir2));
    });
  });

  // ───── listNoteImages() ─────

  describe('listNoteImages()', () => {
    it('lists image files in note directory', async () => {
      const dir = imageService.getImagesDir(VALID_NOTE_ID);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'photo.png'), 'data');
      fs.writeFileSync(path.join(dir, 'diagram.svg'), 'data');
      fs.writeFileSync(path.join(dir, 'readme.txt'), 'data'); // should be excluded

      const files = await imageService.listNoteImages(VALID_NOTE_ID);

      assert.strictEqual(files.length, 2);
      assert.ok(files.includes('photo.png'));
      assert.ok(files.includes('diagram.svg'));
    });

    it('returns empty array when directory does not exist', async () => {
      const files = await imageService.listNoteImages(VALID_NOTE_ID);
      assert.deepStrictEqual(files, []);
    });

    it('returns empty array when directory is empty', async () => {
      const dir = imageService.getImagesDir(VALID_NOTE_ID);
      fs.mkdirSync(dir, { recursive: true });

      const files = await imageService.listNoteImages(VALID_NOTE_ID);
      assert.deepStrictEqual(files, []);
    });
  });

  // ───── Collision handling ─────

  describe('filename collision handling', () => {
    it('appends suffix when filename already exists', async () => {
      const dir = imageService.getImagesDir(VALID_NOTE_ID);
      fs.mkdirSync(dir, { recursive: true });

      // Save first image
      const buffer = Buffer.from([0x89, 0x50]);
      const filename1 = await imageService.saveImageBuffer(VALID_NOTE_ID, buffer, undefined, '.png');

      // Immediately create a file with that exact name to force collision
      // (the first save already created it, so save again)
      const filename2 = await imageService.saveImageBuffer(VALID_NOTE_ID, buffer, undefined, '.png');

      assert.notStrictEqual(filename1, filename2);
      assert.ok(filename2.includes('-2'), `Expected -2 suffix, got: ${filename2}`);
    });
  });

  // ───── IMAGE_EXTENSIONS ─────

  describe('IMAGE_EXTENSIONS', () => {
    it('includes common image formats', () => {
      assert.ok(IMAGE_EXTENSIONS.has('.png'));
      assert.ok(IMAGE_EXTENSIONS.has('.jpg'));
      assert.ok(IMAGE_EXTENSIONS.has('.jpeg'));
      assert.ok(IMAGE_EXTENSIONS.has('.gif'));
      assert.ok(IMAGE_EXTENSIONS.has('.webp'));
      assert.ok(IMAGE_EXTENSIONS.has('.svg'));
      assert.ok(IMAGE_EXTENSIONS.has('.bmp'));
    });

    it('does not include non-image formats', () => {
      assert.ok(!IMAGE_EXTENSIONS.has('.txt'));
      assert.ok(!IMAGE_EXTENSIONS.has('.js'));
      assert.ok(!IMAGE_EXTENSIONS.has('.exe'));
    });
  });

  // ───── migrateFromLegacyDir() ─────

  describe('migrateFromLegacyDir()', () => {
    it('moves images from legacy dir to notes/images', async () => {
      // Create legacy images dir (globalStorage/images/{noteId}/)
      const legacyDir = path.join(tmpDir, 'images', VALID_NOTE_ID);
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(path.join(legacyDir, 'photo.png'), 'imagedata');

      await imageService.migrateFromLegacyDir();

      // Image should now be in notes/images/{noteId}/
      const newPath = path.join(tmpDir, 'notes', 'images', VALID_NOTE_ID, 'photo.png');
      assert.ok(fs.existsSync(newPath));
      assert.strictEqual(fs.readFileSync(newPath, 'utf-8'), 'imagedata');

      // Legacy dir should be removed
      assert.ok(!fs.existsSync(path.join(tmpDir, 'images')));
    });

    it('does nothing when legacy dir does not exist', async () => {
      // Should not throw
      await imageService.migrateFromLegacyDir();
    });

    it('skips non-UUID directories in legacy dir', async () => {
      const legacyDir = path.join(tmpDir, 'images');
      fs.mkdirSync(path.join(legacyDir, 'not-a-uuid'), { recursive: true });
      fs.writeFileSync(path.join(legacyDir, 'not-a-uuid', 'test.png'), 'data');

      await imageService.migrateFromLegacyDir();

      // non-UUID dir should remain in legacy location
      assert.ok(fs.existsSync(path.join(legacyDir, 'not-a-uuid', 'test.png')));
    });
  });
});
