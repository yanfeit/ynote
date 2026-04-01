import * as vscode from 'vscode';
import { JsonDb } from '../database/jsonDb';
import { GitSync } from '../services/gitSync';

function checkRepoUrl(): boolean {
  const repoUrl = vscode.workspace.getConfiguration('ynote').get<string>('githubRepoUrl', '');
  if (!repoUrl) {
    vscode.window.showWarningMessage(
      'GitHub repo URL not configured.',
      'Open Settings'
    ).then(action => {
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'ynote.githubRepoUrl');
      }
    });
    return false;
  }
  return true;
}

export function registerSyncCommand(
  context: vscode.ExtensionContext,
  db: JsonDb,
  gitSync: GitSync,
  onChanged: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('ynote.syncToGithub', async () => {
    if (!checkRepoUrl()) { return; }

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'YNote: Pushing to GitHub...',
          cancellable: false,
        },
        async () => gitSync.sync(db.getDbPath())
      );
      onChanged();
      vscode.window.showInformationMessage(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Push failed: ${message}`);
    }
  });
}

export function registerPullCommand(
  context: vscode.ExtensionContext,
  db: JsonDb,
  gitSync: GitSync,
  onChanged: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('ynote.pullFromGithub', async () => {
    if (!checkRepoUrl()) { return; }

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'YNote: Pulling from GitHub...',
          cancellable: false,
        },
        async () => gitSync.pull(db.getDbPath())
      );
      onChanged();
      vscode.window.showInformationMessage(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Pull failed: ${message}`);
    }
  });
}
