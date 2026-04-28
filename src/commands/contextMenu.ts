import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { JsonDb } from '../database/jsonDb';
import { NoteDb } from '../database/noteDb';
import { ImageService } from '../services/imageService';
import { ReadingItem } from '../providers/readingsTreeProvider';
import { NoteItem } from '../providers/notesTreeProvider';

/**
 * Register all context menu commands for readings and notes.
 */
export function registerContextMenuCommands(
  context: vscode.ExtensionContext,
  db: JsonDb,
  noteDb: NoteDb,
  onChanged: () => void,
  imageService?: ImageService
): vscode.Disposable[] {
  return [
    // ── Reading context menu ──

    vscode.commands.registerCommand('ynote.copyReading', async (item: ReadingItem) => {
      if (!item?.reading?.url) { return; }
      await vscode.env.clipboard.writeText(item.reading.url);
      vscode.window.showInformationMessage('URL copied to clipboard.');
    }),

    vscode.commands.registerCommand('ynote.cutReading', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      await vscode.env.clipboard.writeText(item.reading.url);
      const confirm = await vscode.window.showWarningMessage(
        `Cut "${item.reading.title}"? The URL has been copied. The reading will be permanently deleted.`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        try {
          await db.remove(item.reading.id);
          onChanged();
          vscode.window.showInformationMessage('Reading cut (URL copied, entry deleted).');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to delete reading: ${message}`);
        }
      }
    }),

    vscode.commands.registerCommand('ynote.renameReading', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const newTitle = await vscode.window.showInputBox({
        prompt: 'Enter new title for this reading',
        value: item.reading.title,
        validateInput: (value) => value.trim() ? null : 'Title cannot be empty',
      });
      if (!newTitle) { return; }
      try {
        await db.update(item.reading.id, { title: newTitle.trim() });
        onChanged();
        vscode.window.showInformationMessage(`Reading renamed to "${newTitle.trim()}".`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to rename reading: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.deleteReading', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Permanently delete "${item.reading.title}"? This cannot be undone.`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        try {
          await db.remove(item.reading.id);
          onChanged();
          vscode.window.showInformationMessage('Reading permanently deleted.');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to delete reading: ${message}`);
        }
      }
    }),

    vscode.commands.registerCommand('ynote.downloadReading', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const r = item.reading;
      const content = [
        `# ${r.title}`,
        '',
        r.author ? `**Author:** ${r.author}` : '',
        r.organization ? `**Organization:** ${r.organization}` : '',
        `**URL:** ${r.url}`,
        r.source ? `**Source:** ${r.source}` : '',
        r.tags.length > 0 ? `**Tags:** ${r.tags.join(', ')}` : '',
        '',
        r.abstract ? `## Abstract\n\n${r.abstract}` : '',
        '',
        `*Added: ${new Date(r.addedAt).toLocaleString()}*`,
      ].filter(line => line !== '').join('\n');

      const defaultName = r.title.replace(/[/\\:*?"<>|]/g, '-').replace(/-{2,}/g, '-').trim().slice(0, 100) || 'reading';
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(getDefaultDownloadDir(), `${defaultName}.md`)),
        filters: { 'Markdown': ['md'], 'All Files': ['*'] },
      });
      if (!uri) { return; }
      try {
        await fs.promises.writeFile(uri.fsPath, content, 'utf-8');
        vscode.window.showInformationMessage(`Reading saved to ${uri.fsPath}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to save reading: ${message}`);
      }
    }),

    // ── Note context menu ──

    vscode.commands.registerCommand('ynote.copyNote', async (item: NoteItem) => {
      if (!item?.note?.filePath) { return; }
      try {
        const content = await fs.promises.readFile(item.note.filePath, 'utf-8');
        await vscode.env.clipboard.writeText(content);
        vscode.window.showInformationMessage('Note content copied to clipboard.');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to copy note: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.cutNote', async (item: NoteItem) => {
      if (!item?.note) { return; }
      try {
        const content = await fs.promises.readFile(item.note.filePath, 'utf-8');
        await vscode.env.clipboard.writeText(content);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to read note: ${message}`);
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Cut "${item.note.title}"? The content has been copied. The note will be permanently deleted.`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        try {
          const noteId = item.note.id;
          await noteDb.remove(noteId);
          if (imageService) {
            try { await imageService.deleteNoteImages(noteId); } catch { /* non-fatal */ }
          }
          onChanged();
          vscode.window.showInformationMessage('Note cut (content copied, file deleted).');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to delete note: ${message}`);
        }
      }
    }),

    vscode.commands.registerCommand('ynote.renameNote', async (item: NoteItem) => {
      if (!item?.note) { return; }
      const newTitle = await vscode.window.showInputBox({
        prompt: 'Enter new title for this note',
        value: item.note.title,
        validateInput: (value) => value.trim() ? null : 'Title cannot be empty',
      });
      if (!newTitle) { return; }
      try {
        await noteDb.updateMetadata(item.note.id, { title: newTitle.trim() });
        onChanged();
        vscode.window.showInformationMessage(`Note renamed to "${newTitle.trim()}".`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to rename note: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.deleteNote', async (item: NoteItem) => {
      if (!item?.note) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Permanently delete "${item.note.title}"? This cannot be undone.`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        try {
          const noteId = item.note.id;
          await noteDb.remove(noteId);
          if (imageService) {
            try { await imageService.deleteNoteImages(noteId); } catch { /* non-fatal */ }
          }
          onChanged();
          vscode.window.showInformationMessage('Note permanently deleted.');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to delete note: ${message}`);
        }
      }
    }),

    vscode.commands.registerCommand('ynote.downloadNote', async (item: NoteItem) => {
      if (!item?.note?.filePath) { return; }
      const defaultName = item.note.title.replace(/[/\\:*?"<>|]/g, '-').replace(/-{2,}/g, '-').trim().slice(0, 100) || 'note';
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(getDefaultDownloadDir(), `${defaultName}.md`)),
        filters: { 'Markdown': ['md'], 'All Files': ['*'] },
      });
      if (!uri) { return; }
      try {
        await fs.promises.copyFile(item.note.filePath, uri.fsPath);
        vscode.window.showInformationMessage(`Note saved to ${uri.fsPath}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to save note: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.pinNote', async (item: NoteItem) => {
      if (!item?.note) { return; }
      try {
        await noteDb.pin(item.note.id, true);
        onChanged();
        vscode.window.showInformationMessage(`Note "${item.note.title}" pinned.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to pin note: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.unpinNote', async (item: NoteItem) => {
      if (!item?.note) { return; }
      try {
        await noteDb.pin(item.note.id, false);
        onChanged();
        vscode.window.showInformationMessage(`Note "${item.note.title}" unpinned.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to unpin note: ${message}`);
      }
    }),
  ];
}

function getDefaultDownloadDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '/tmp';
}
