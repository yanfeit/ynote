import * as vscode from 'vscode';
import { JsonDb } from './database/jsonDb';
import { GitSync } from './services/gitSync';
import { ReadingsTreeProvider, ReadingItem } from './providers/readingsTreeProvider';
import { DashboardPanel } from './webview/DashboardPanel';
import { registerAddReadingCommand } from './commands/addReading';
import { registerSyncCommand, registerPullCommand } from './commands/syncToGithub';
import { fetchMetadata } from './services/metadataFetcher';

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
    registerPullCommand(context, db, gitSync, onChanged),

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
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
