import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { JsonDb } from '../database/jsonDb';
import { fetchMetadata } from '../services/metadataFetcher';
import { Reading } from '../models/reading';

export function registerAddReadingCommand(
  context: vscode.ExtensionContext,
  db: JsonDb,
  onChanged: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('ynote.addReading', async () => {
    // Prompt for URL
    const url = await vscode.window.showInputBox({
      prompt: 'Enter the URL of the article or blog post',
      placeHolder: 'https://...',
      validateInput: (value) => {
        if (!value) { return 'URL is required'; }
        try {
          new URL(value);
          return null;
        } catch {
          return 'Please enter a valid URL';
        }
      },
    });

    if (!url) { return; }

    // Check for duplicates
    const existing = await db.findByUrl(url);
    if (existing) {
      vscode.window.showWarningMessage(`This URL is already saved: "${existing.title}"`);
      return;
    }

    // Fetch metadata with progress
    const metadata = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'YNote: Fetching metadata...',
        cancellable: false,
      },
      async () => fetchMetadata(url)
    );

    // Let user confirm/edit the title
    const title = await vscode.window.showInputBox({
      prompt: 'Confirm or edit the title',
      value: metadata.title || url,
    });

    if (!title) { return; }

    const now = new Date().toISOString();
    const reading: Reading = {
      id: uuidv4(),
      url,
      title,
      author: metadata.author || '',
      organization: metadata.organization || '',
      abstract: metadata.abstract || '',
      addedAt: now,
      updatedAt: now,
      tags: [],
      source: metadata.source || '',
    };

    try {
      await db.add(reading);
      onChanged();
      vscode.window.showInformationMessage(`Saved: "${reading.title}"`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to save reading: ${message}`);
    }
  });
}
