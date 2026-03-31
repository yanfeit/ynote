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
    // Group readings by year-month
    const groups = new Map<string, Reading[]>();
    for (const r of readings) {
      const d = new Date(r.addedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups.has(key)) { groups.set(key, []); }
      groups.get(key)!.push(r);
    }
    const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));

    const sections = sortedKeys.map((key, index) => {
      const groupReadings = groups.get(key)!;
      const isLatest = index === 0;
      const cards = groupReadings.map(r => {
        const date = new Date(r.addedAt).toLocaleDateString();
        const author = r.author ? `<span class="author">By ${this.escapeHtml(r.author)}</span>` : '';
        const org = r.organization ? `<span class="org">${this.escapeHtml(r.organization)}</span>` : '';
        const meta = [author, org].filter(Boolean).join(' · ');
        const tags = r.tags.length > 0
          ? `<div class="tags">${r.tags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join(' ')}</div>`
          : '';

        return `
          <div class="card" data-title="${this.escapeAttr(r.title)}" data-author="${this.escapeAttr(r.author)}" data-org="${this.escapeAttr(r.organization)}" data-abstract="${this.escapeAttr(r.abstract)}" data-tags="${this.escapeAttr(r.tags.join(' '))}">
            <div class="card-header">
              <a href="#" class="title" onclick="openUrl('${this.escapeAttr(r.url)}')">${this.escapeHtml(r.title)}</a>
              <span class="date">${date}</span>
            </div>
            ${meta ? `<div class="meta">${meta}</div>` : ''}
            ${r.abstract ? `<p class="abstract">${this.escapeHtml(r.abstract)}</p>` : ''}
            <div class="footer">
              <span class="source">${this.escapeHtml(r.source)}</span>
              ${tags}
            </div>
          </div>`;
      }).join('\n');

      return `
        <div class="section" data-yearmonth="${key}">
          <div class="section-header" onclick="toggleSection(this)">
            <span class="section-toggle">${isLatest ? '▼' : '▶'}</span>
            <span class="section-title">${key}</span>
            <span class="section-count">${groupReadings.length} reading${groupReadings.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="section-body" style="display: ${isLatest ? 'block' : 'none'}">
            ${cards}
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
    .section {
      margin-bottom: 8px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 4px;
      user-select: none;
      font-weight: 600;
      font-size: 1.05em;
      background: var(--vscode-sideBar-background);
    }
    .section-header:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .section-toggle {
      font-size: 0.75em;
      width: 12px;
    }
    .section-count {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      font-weight: normal;
      margin-left: auto;
    }
    .section-body {
      padding: 8px 0 0 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-left: auto;
    }
    .tag {
      font-size: 0.78em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 7px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>YNote Readings</h1>
    <span class="count">${readings.length} reading${readings.length !== 1 ? 's' : ''}</span>
  </div>
  <input class="search-bar" type="text" placeholder="Search by title, author, tag, or keyword..." oninput="filterCards(this.value)">
  <div class="cards">
    ${readings.length > 0 ? sections : '<div class="empty">No readings yet. Press Ctrl+Shift+Y to add one.</div>'}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function openUrl(url) {
      vscode.postMessage({ command: 'openUrl', url: url });
    }
    function toggleSection(header) {
      const body = header.nextElementSibling;
      const toggle = header.querySelector('.section-toggle');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▼';
      } else {
        body.style.display = 'none';
        toggle.textContent = '▶';
      }
    }
    function filterCards(query) {
      const q = query.toLowerCase();
      document.querySelectorAll('.section').forEach(section => {
        let visibleCount = 0;
        section.querySelectorAll('.card').forEach(card => {
          const text = [
            card.dataset.title,
            card.dataset.author,
            card.dataset.org,
            card.dataset.abstract,
            card.dataset.tags
          ].join(' ').toLowerCase();
          const visible = text.includes(q);
          card.style.display = visible ? '' : 'none';
          if (visible) { visibleCount++; }
        });
        section.style.display = visibleCount > 0 ? '' : 'none';
        if (q && visibleCount > 0) {
          const body = section.querySelector('.section-body');
          const toggle = section.querySelector('.section-toggle');
          body.style.display = 'block';
          toggle.textContent = '▼';
        }
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
