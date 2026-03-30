import * as vscode from 'vscode';
import { JsonDb } from '../database/jsonDb';
import { GitSync } from '../services/gitSync';

export function registerSyncCommand(
  context: vscode.ExtensionContext,
  db: JsonDb,
  gitSync: GitSync,
  onChanged: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('ynote.syncToGithub', async () => {
    const repoUrl = vscode.workspace.getConfiguration('ynote').get<string>('githubRepoUrl', '');
    if (!repoUrl) {
      const action = await vscode.window.showWarningMessage(
        'GitHub repo URL not configured.',
        'Open Settings'
      );
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'ynote.githubRepoUrl');
      }
      return;
    }

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'YNote: Syncing to GitHub...',
          cancellable: false,
        },
        async () => gitSync.sync(db.getDbPath())
      );
      onChanged();
      vscode.window.showInformationMessage(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Sync failed: ${message}`);
    }
  });
}
