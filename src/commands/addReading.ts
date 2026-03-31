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
    let metadata: Partial<Reading>;
    try {
      metadata = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'YNote: Fetching metadata...',
          cancellable: false,
        },
        async () => fetchMetadata(url)
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const action = await vscode.window.showErrorMessage(
        `Failed to fetch metadata: ${message}`,
        'Save URL Only',
        'Cancel'
      );
      if (action !== 'Save URL Only') { return; }
      // Fallback: save with URL as title, no metadata
      metadata = { url, title: url, author: '', organization: '', abstract: '', source: '' };
    }

    // Let user confirm/edit the title
    const title = await vscode.window.showInputBox({
      prompt: 'Confirm or edit the title',
      value: metadata.title || url,
    });

    if (!title) { return; }

    // Tag input with recommendations
    const allTags = await db.getAllTags();
    let tags: string[] = [];

    if (allTags.length > 0) {
      // Show existing tags for quick selection
      const titleWords = title
        .toLowerCase()
        .split(/[\s\-_:,;.()\[\]{}|/\\]+/)
        .filter((w: string) => w.length > 2)
        .filter((w: string) => !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'how', 'what', 'why', 'new'].includes(w));

      const pickItems: vscode.QuickPickItem[] = allTags.map(tag => ({ label: tag }));
      // Add keyword suggestions from title
      for (const word of titleWords) {
        if (!allTags.some(t => t.toLowerCase() === word)) {
          pickItems.push({ label: word, description: '(suggested)' });
        }
      }

      const picks = await vscode.window.showQuickPick(pickItems, {
        canPickMany: true,
        placeHolder: 'Select tags (optional, press Enter to skip)',
        title: 'Add tags',
      });
      if (picks) {
        tags = picks.map(p => p.label);
      }
    }

    // Allow custom tags
    const customTags = await vscode.window.showInputBox({
      prompt: 'Add custom tags (comma-separated, leave empty to skip)',
      placeHolder: 'e.g., machine-learning, transformer',
    });
    if (customTags) {
      const parsed = customTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      tags = [...new Set([...tags, ...parsed])];
    }

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
      tags,
      source: metadata.source || '',
      isRead: false,
      comment: '',
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
