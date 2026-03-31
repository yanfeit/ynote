import * as vscode from 'vscode';
import { JsonDb } from './database/jsonDb';
import { GitSync } from './services/gitSync';
import { ReadingsTreeProvider, ReadingItem } from './providers/readingsTreeProvider';
import { DashboardPanel } from './webview/DashboardPanel';
import { registerAddReadingCommand } from './commands/addReading';
import { registerSyncCommand } from './commands/syncToGithub';

export function activate(context: vscode.ExtensionContext): void {
  const db = new JsonDb(context);
  const gitSync = new GitSync(context);
  const treeProvider = new ReadingsTreeProvider(db);

  const onChanged = () => {
    treeProvider.refresh();
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.update();
    }
  };

  // Register tree view
  const treeView = vscode.window.createTreeView('ynoteReadings', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Register commands
  context.subscriptions.push(
    registerAddReadingCommand(context, db, onChanged),
    registerSyncCommand(context, db, gitSync, onChanged),

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

    vscode.commands.registerCommand('ynote.showDashboard', () => {
      DashboardPanel.createOrShow(db);
    }),

    vscode.commands.registerCommand('ynote.refreshReadings', () => {
      onChanged();
    }),

    vscode.commands.registerCommand('ynote.editTags', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const reading = item.reading;

      // Get all existing tags for recommendations
      const allTags = await db.getAllTags();
      // Extract keywords from title for smart suggestions
      const titleWords = reading.title
        .toLowerCase()
        .split(/[\s\-_:,;.()\[\]{}|/\\]+/)
        .filter(w => w.length > 2)
        .filter(w => !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'how', 'what', 'why', 'new'].includes(w));

      // Build pick items: existing tags first, then keyword suggestions
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

      // Add keyword suggestions not already in existing tags
      for (const word of titleWords) {
        if (!allTags.some(t => t.toLowerCase() === word)) {
          pickItems.push({
            label: word,
            description: '(suggested from title)',
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

    vscode.commands.registerCommand('ynote.toggleReadStatus', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const reading = item.reading;
      const newStatus = !reading.isRead;
      try {
        await db.update(reading.id, { isRead: newStatus });
        onChanged();
        vscode.window.showInformationMessage(
          newStatus ? `Marked "${reading.title}" as read.` : `Marked "${reading.title}" as unread.`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to update read status: ${message}`);
      }
    }),

    vscode.commands.registerCommand('ynote.editComment', async (item: ReadingItem) => {
      if (!item?.reading) { return; }
      const reading = item.reading;
      const comment = await vscode.window.showInputBox({
        prompt: `Comment for "${reading.title}"`,
        placeHolder: 'Enter your comment or notes about this reading...',
        value: reading.comment || '',
      });
      if (comment === undefined) { return; } // cancelled
      try {
        await db.update(reading.id, { comment });
        onChanged();
        if (comment) {
          vscode.window.showInformationMessage(`Comment saved for "${reading.title}"`);
        } else {
          vscode.window.showInformationMessage(`Comment cleared for "${reading.title}"`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to save comment: ${message}`);
      }
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
