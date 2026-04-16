import * as vscode from 'vscode';
import * as path from 'path';
import { NoteDb } from '../database/noteDb';
import { ImageService } from '../services/imageService';

const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
];

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
};

const YNOTE_PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append('ynote', 'image', 'paste');
const YNOTE_DROP_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append('ynote', 'image', 'drop');

/**
 * DocumentPasteEditProvider that intercepts image paste events in YNote notes.
 * When the user pastes an image (e.g., screenshot from clipboard), it saves
 * the image to the note's image directory and inserts a Markdown image link.
 */
export class ImagePasteProvider implements vscode.DocumentPasteEditProvider {
  constructor(
    private noteDb: NoteDb,
    private imageService: ImageService
  ) {}

  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    _ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {
    // Find the first image MIME type in the data transfer
    let imageData: vscode.DataTransferItem | undefined;
    let mimeType = '';
    for (const mime of IMAGE_MIME_TYPES) {
      const item = dataTransfer.get(mime);
      if (item) {
        imageData = item;
        mimeType = mime;
        break;
      }
    }

    if (!imageData || !mimeType) { return undefined; }
    if (token.isCancellationRequested) { return undefined; }

    // Verify the document is a YNote note
    const filePath = document.uri.fsPath;
    const notesDirPath = this.noteDb.getNotesDir();
    if (!filePath.startsWith(notesDirPath) || !filePath.endsWith('.md')) {
      return undefined;
    }

    // Extract note ID from front matter
    const noteId = await this.noteDb.getIdFromFile(filePath);
    if (!noteId) { return undefined; }
    if (token.isCancellationRequested) { return undefined; }

    // Get image data as Uint8Array
    const file = imageData.asFile?.();
    if (!file) { return undefined; }

    const data = await file.data();
    if (!data || data.byteLength === 0) { return undefined; }
    if (token.isCancellationRequested) { return undefined; }

    try {
      const ext = MIME_TO_EXT[mimeType] || '.png';
      const buffer = Buffer.from(data);
      const filename = await this.imageService.saveImageBuffer(noteId, buffer, undefined, ext);
      const relativePath = this.imageService.getRelativePath(noteId, filename);

      const pasteEdit = new vscode.DocumentPasteEdit(
        new vscode.SnippetString(`![paste](${relativePath})`),
        'Insert image',
        YNOTE_PASTE_KIND,
      );
      pasteEdit.yieldTo = []; // Don't yield to other paste providers
      return [pasteEdit];
    } catch {
      return undefined;
    }
  }
}

/**
 * DocumentDropEditProvider that handles image files dragged into YNote notes.
 * When the user drags an image from the file explorer into a note, it copies
 * the image and inserts a Markdown image link.
 */
export class ImageDropProvider implements vscode.DocumentDropEditProvider {
  constructor(
    private noteDb: NoteDb,
    private imageService: ImageService
  ) {}

  async provideDocumentDropEdits(
    document: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentDropEdit | undefined> {
    // Look for file entries in the data transfer
    const uriListItem = dataTransfer.get('text/uri-list');
    if (!uriListItem) { return undefined; }

    const uriList = await uriListItem.asString();
    if (!uriList) { return undefined; }
    if (token.isCancellationRequested) { return undefined; }

    // Parse the URI list — typically one URI per line
    const uris = uriList.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

    if (uris.length === 0) { return undefined; }

    // Verify the document is a YNote note
    const filePath = document.uri.fsPath;
    const notesDirPath = this.noteDb.getNotesDir();
    if (!filePath.startsWith(notesDirPath) || !filePath.endsWith('.md')) {
      return undefined;
    }

    // Extract note ID
    const noteId = await this.noteDb.getIdFromFile(filePath);
    if (!noteId) { return undefined; }
    if (token.isCancellationRequested) { return undefined; }

    // Process the first image file found
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
    for (const uriStr of uris) {
      try {
        const uri = vscode.Uri.parse(uriStr);
        if (uri.scheme !== 'file') { continue; }

        const ext = path.extname(uri.fsPath).toLowerCase();
        if (!imageExtensions.has(ext)) { continue; }

        const filename = await this.imageService.saveLocalImage(noteId, uri.fsPath);
        const relativePath = this.imageService.getRelativePath(noteId, filename);
        const altText = path.basename(uri.fsPath, ext);

        const dropEdit = new vscode.DocumentDropEdit(
          new vscode.SnippetString(`![${altText}](${relativePath})`),
          'Insert image',
          YNOTE_DROP_KIND,
        );
        dropEdit.yieldTo = [];
        return dropEdit;
      } catch {
        continue;
      }
    }

    return undefined;
  }
}
