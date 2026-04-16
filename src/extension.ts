import * as vscode from 'vscode';
import { JsonDb } from './database/jsonDb';
import { NoteDb } from './database/noteDb';
import { GitSync } from './services/gitSync';
import { ReadingsTreeProvider, ReadingItem } from './providers/readingsTreeProvider';
import { NotesTreeProvider, NoteItem } from './providers/notesTreeProvider';
import { ActionsTreeProvider } from './providers/actionsTreeProvider';
import { DashboardPanel } from './webview/DashboardPanel';
import { registerAddReadingCommand } from './commands/addReading';
import { registerSyncCommand, registerPullCommand } from './commands/syncToGithub';
import { registerContextMenuCommands } from './commands/contextMenu';
import { registerInsertImageCommand } from './commands/insertImage';
import { ImageService } from './services/imageService';
import { ImagePasteProvider, ImageDropProvider } from './providers/imagePasteProvider';
import { fetchMetadata } from './services/metadataFetcher';

export function activate(context: vscode.ExtensionContext): void {
  const db = new JsonDb(context);
  const noteDb = new NoteDb(context);
  const gitSync = new GitSync(context);
  const imageService = new ImageService(context);
  const treeProvider = new ReadingsTreeProvider(db);
  const notesTreeProvider = new NotesTreeProvider(noteDb);
  const actionsTreeProvider = new ActionsTreeProvider();

  const onChanged = () => {
    treeProvider.refresh();
    notesTreeProvider.refresh();
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.update();
    }
  };

  // Register tree views
  const treeView = vscode.window.createTreeView('ynoteReadings', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const notesTreeView = vscode.window.createTreeView('ynoteNotes', {
    treeDataProvider: notesTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(notesTreeView);

  const actionsTreeView = vscode.window.createTreeView('ynoteActions', {
    treeDataProvider: actionsTreeProvider,
  });
  context.subscriptions.push(actionsTreeView);

  // Register commands
  context.subscriptions.push(
    registerAddReadingCommand(context, db, onChanged),
    registerSyncCommand(context, db, noteDb, gitSync, onChanged, imageService),
    registerPullCommand(context, db, noteDb, gitSync, onChanged, imageService),
    ...registerContextMenuCommands(context, db, noteDb, onChanged, imageService),
    registerInsertImageCommand(noteDb, imageService),

    vscode.commands.registerCommand('ynote.removeReading', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Remove "${item.reading.title}"?`,
        { modal: true },
        'Remove'
      );
      if (confirm === 'Remove') {
        try {
          await db.remove(item.reading.id);
          onChanged();
          vscode.window.showInformationMessage('Reading removed.');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to remove: ${message}`);
        }
      }
    }),

    vscode.commands.registerCommand('ynote.openReading', (item: ReadingItem) => {
      if (item?.reading?.url) {
        vscode.env.openExternal(vscode.Uri.parse(item.reading.url));
      }
    }),

    vscode.commands.registerCommand('ynote.showReadingInDashboard', (readingId: string) => {
      if (readingId) {
        DashboardPanel.createOrShow(db, readingId);
      }
    }),

    vscode.commands.registerCommand('ynote.showDashboard', () => {
      DashboardPanel.createOrShow(db);
    }),

    vscode.commands.registerCommand('ynote.refreshReadings', () => {
      onChanged();
    }),

    vscode.commands.registerCommand('ynote.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:yanfeit.ynote');
    }),

    vscode.commands.registerCommand('ynote.editTags', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const reading = item.reading;

      // Re-fetch content-based tag suggestions from the URL
      let suggestedTags: string[] = [];
      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'YNote: Fetching content for tag suggestions...',
            cancellable: false,
          },
          async () => fetchMetadata(reading.url)
        );
        suggestedTags = result.suggestedTags;
      } catch {
        // If fetch fails, continue without content-based suggestions
      }

      // Get all existing tags for recommendations
      const allTags = await db.getAllTags();
      const currentTags = new Set(reading.tags);
      const pickItems: vscode.QuickPickItem[] = [];

      // Add existing tags (sorted by frequency)
      for (const tag of allTags) {
        pickItems.push({
          label: tag,
          description: currentTags.has(tag) ? '(current)' : '',
          picked: currentTags.has(tag),
        });
      }

      // Add content-based suggestions not already in existing tags
      for (const suggested of suggestedTags) {
        if (!allTags.some(t => t.toLowerCase() === suggested.toLowerCase())) {
          pickItems.push({
            label: suggested,
            description: '(suggested from content)',
            picked: false,
          });
        }
      }

      const picks = await vscode.window.showQuickPick(pickItems, {
        canPickMany: true,
        placeHolder: 'Select tags or type to add new ones (press Enter to confirm)',
        title: `Tags for "${reading.title}"`,
      });

      if (picks === undefined) { return; } // cancelled

      let tags = picks.map(p => p.label);

      // Allow adding a custom tag
      const custom = await vscode.window.showInputBox({
        prompt: 'Add custom tags (comma-separated, leave empty to skip)',
        placeHolder: 'e.g., machine-learning, transformer',
      });
      if (custom) {
        const customTags = custom.split(',').map(t => t.trim()).filter(t => t.length > 0);
        tags = [...new Set([...tags, ...customTags])];
      }

      try {
        await db.update(reading.id, { tags });
        onChanged();
        vscode.window.showInformationMessage(`Tags updated for "${reading.title}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to update tags: ${message}`);
      }
    }),

    // ── Note commands ──

    vscode.commands.registerCommand('ynote.createNote', async () => {
      const title = await vscode.window.showInputBox({
        prompt: 'Enter a title for your note',
        placeHolder: 'e.g., Meeting notes, Architecture ideas',
        validateInput: (value) => value ? null : 'Title is required',
      });
      if (!title) { return; }

      // Tag input
      const allTags = [...new Set([...(await db.getAllTags()), ...(await noteDb.getAllTags())])];
      let tags: string[] = [];
      if (allTags.length > 0) {
        const pickItems: vscode.QuickPickItem[] = allTags.map(tag => ({ label: tag }));
        const picks = await vscode.window.showQuickPick(pickItems, {
          canPickMany: true,
          placeHolder: 'Select tags (optional, press Enter to skip)',
          title: 'Add tags',
        });
        if (picks) { tags = picks.map(p => p.label); }
      }
      const customTags = await vscode.window.showInputBox({
        prompt: 'Add custom tags (comma-separated, leave empty to skip)',
        placeHolder: 'e.g., ideas, architecture',
      });
      if (customTags) {
        const parsed = customTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
        tags = [...new Set([...tags, ...parsed])];
      }

      try {
        const note = await noteDb.add(title, tags);
        onChanged();
        const doc = await vscode.workspace.openTextDocument(note.filePath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`Note created: "${title}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to create note: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.openNote', async (item: NoteItem) => {
      if (!item?.note?.filePath) { return; }
      try {
        const doc = await vscode.workspace.openTextDocument(item.note.filePath);
        await vscode.window.showTextDocument(doc);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to open note: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.removeNote', async (item: NoteItem) => {
      if (!item?.note) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Remove note "${item.note.title}"?`,
        { modal: true },
        'Remove'
      );
      if (confirm === 'Remove') {
        try {
          const noteId = item.note.id;
          await noteDb.remove(noteId);
          try { await imageService.deleteNoteImages(noteId); } catch { /* non-fatal */ }
          onChanged();
          vscode.window.showInformationMessage('Note removed.');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to remove note: ${message}`);
        }
      }
    }),

    vscode.commands.registerCommand('ynote.editNoteTags', async (item: NoteItem) => {
      if (!item?.note) { return; }
      const note = item.note;

      const allTags = [...new Set([...(await db.getAllTags()), ...(await noteDb.getAllTags())])];
      const currentTags = new Set(note.tags);
      const pickItems: vscode.QuickPickItem[] = [];

      for (const tag of allTags) {
        pickItems.push({
          label: tag,
          description: currentTags.has(tag) ? '(current)' : '',
          picked: currentTags.has(tag),
        });
      }

      const picks = await vscode.window.showQuickPick(pickItems, {
        canPickMany: true,
        placeHolder: 'Select tags or type to add new ones (press Enter to confirm)',
        title: `Tags for "${note.title}"`,
      });

      if (picks === undefined) { return; }

      let tags = picks.map(p => p.label);

      const custom = await vscode.window.showInputBox({
        prompt: 'Add custom tags (comma-separated, leave empty to skip)',
        placeHolder: 'e.g., machine-learning, transformer',
      });
      if (custom) {
        const customParsed = custom.split(',').map(t => t.trim()).filter(t => t.length > 0);
        tags = [...new Set([...tags, ...customParsed])];
      }

      try {
        await noteDb.updateMetadata(note.id, { tags });
        onChanged();
        vscode.window.showInformationMessage(`Tags updated for "${note.title}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to update tags: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.refreshNotes', () => {
      notesTreeProvider.refresh();
    }),
  );

  // Register image paste and drop providers for notes
  const notesDirPath = noteDb.getNotesDir();
  const noteSelector: vscode.DocumentSelector = {
    language: 'markdown',
    pattern: `${notesDirPath}/**`,
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentPasteEditProvider(
      noteSelector,
      new ImagePasteProvider(noteDb, imageService),
      {
        providedPasteEditKinds: [vscode.DocumentDropOrPasteEditKind.Empty.append('ynote', 'image', 'paste')],
        pasteMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'],
      }
    ),
    vscode.languages.registerDocumentDropEditProvider(
      noteSelector,
      new ImageDropProvider(noteDb, imageService),
      {
        providedDropEditKinds: [vscode.DocumentDropOrPasteEditKind.Empty.append('ynote', 'image', 'drop')],
        dropMimeTypes: ['text/uri-list'],
      }
    )
  );

  // Watch for saves to note files → update updatedAt in front matter
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const filePath = doc.uri.fsPath;
      if (filePath.startsWith(notesDirPath) && filePath.endsWith('.md')) {
        try {
          const id = await noteDb.getIdFromFile(filePath);
          if (id) {
            await noteDb.touchUpdatedAt(id);
            notesTreeProvider.refresh();
          }
        } catch {
          // Silently ignore — file may not be a valid note
        }
      }
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
