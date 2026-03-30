import * as vscode from 'vscode';
import { JsonDb } from '../database/jsonDb';
import { Reading } from '../models/reading';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private static readonly viewType = 'ynoteDashboard';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private db: JsonDb
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'openUrl') {
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
        } else if (msg.command === 'refresh') {
          await this.update();
        }
      },
      null,
      this.disposables
    );
    this.update();
  }

  static createOrShow(db: JsonDb): DashboardPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.update();
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'YNote Dashboard',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, db);
    return DashboardPanel.currentPanel;
  }

  async update(): Promise<void> {
    const readings = await this.db.getAll();
    this.panel.webview.html = this.getHtml(readings);
  }

  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }

  private getHtml(readings: Reading[]): string {
    const cards = readings.map(r => {
      const date = new Date(r.addedAt).toLocaleDateString();
      const author = r.author ? `<span class="author">By ${this.escapeHtml(r.author)}</span>` : '';
      const org = r.organization ? `<span class="org">${this.escapeHtml(r.organization)}</span>` : '';
      const meta = [author, org].filter(Boolean).join(' · ');

      return `
        <div class="card" data-title="${this.escapeAttr(r.title)}" data-author="${this.escapeAttr(r.author)}" data-org="${this.escapeAttr(r.organization)}" data-abstract="${this.escapeAttr(r.abstract)}">
          <div class="card-header">
            <a href="#" class="title" onclick="openUrl('${this.escapeAttr(r.url)}')">${this.escapeHtml(r.title)}</a>
            <span class="date">${date}</span>
          </div>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
          ${r.abstract ? `<p class="abstract">${this.escapeHtml(r.abstract)}</p>` : ''}
          <div class="footer">
            <span class="source">${this.escapeHtml(r.source)}</span>
          </div>
        </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YNote Dashboard</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0;
      font-size: 1.4em;
      font-weight: 600;
    }
    .count {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .search-bar {
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 16px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 0.95em;
      outline: none;
      box-sizing: border-box;
    }
    .search-bar:focus {
      border-color: var(--vscode-focusBorder);
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      padding: 14px 16px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 6px;
    }
    .title {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-weight: 600;
      font-size: 1.05em;
      cursor: pointer;
    }
    .title:hover {
      text-decoration: underline;
    }
    .date {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      white-space: nowrap;
    }
    .meta {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      margin-bottom: 6px;
    }
    .abstract {
      margin: 6px 0 8px;
      line-height: 1.5;
      font-size: 0.93em;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .source {
      color: var(--vscode-descriptionForeground);
      font-size: 0.82em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
    }
    .empty {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      margin-top: 40px;
      font-size: 1.1em;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>YNote Readings</h1>
    <span class="count">${readings.length} reading${readings.length !== 1 ? 's' : ''}</span>
  </div>
  <input class="search-bar" type="text" placeholder="Search by title, author, or keyword..." oninput="filterCards(this.value)">
  <div class="cards">
    ${readings.length > 0 ? cards : '<div class="empty">No readings yet. Press Ctrl+Shift+Y to add one.</div>'}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function openUrl(url) {
      vscode.postMessage({ command: 'openUrl', url: url });
    }
    function filterCards(query) {
      const q = query.toLowerCase();
      document.querySelectorAll('.card').forEach(card => {
        const text = [
          card.dataset.title,
          card.dataset.author,
          card.dataset.org,
          card.dataset.abstract
        ].join(' ').toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private escapeAttr(text: string): string {
    return this.escapeHtml(text).replace(/\n/g, ' ');
  }
}
