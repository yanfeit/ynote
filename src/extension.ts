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
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
