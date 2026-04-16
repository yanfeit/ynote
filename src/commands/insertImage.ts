import * as vscode from 'vscode';
import * as path from 'path';
import { NoteDb } from '../database/noteDb';
import { ImageService } from '../services/imageService';

/**
 * Register the insert-image command for notes.
 * Opens a file picker, copies the image to the note's image directory,
 * and inserts a Markdown image link at the cursor position.
 */
export function registerInsertImageCommand(
  noteDb: NoteDb,
  imageService: ImageService
): vscode.Disposable {
  return vscode.commands.registerCommand('ynote.insertImage', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a note first.');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const notesDirPath = noteDb.getNotesDir();

    // Verify the active file is inside the notes directory
    if (!filePath.startsWith(notesDirPath) || !filePath.endsWith('.md')) {
      vscode.window.showWarningMessage('This command only works inside YNote notes.');
      return;
    }

    // Extract the note ID from the file's front matter
    const noteId = await noteDb.getIdFromFile(filePath);
    if (!noteId) {
      vscode.window.showErrorMessage('Could not identify this note. Is the front matter valid?');
      return;
    }

    // Open file picker for images
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Insert Image',
      filters: {
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
      },
    });

    if (!uris || uris.length === 0) { return; }

    const sourcePath = uris[0].fsPath;

    try {
      const filename = await imageService.saveLocalImage(noteId, sourcePath);
      const relativePath = imageService.getRelativePath(noteId, filename);
      const altText = path.basename(sourcePath, path.extname(sourcePath));
      const markdownLink = `![${altText}](${relativePath})`;

      await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, markdownLink);
      });

      vscode.window.showInformationMessage(`Image inserted: ${filename}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to insert image: ${message}`);
    }
  });
}
