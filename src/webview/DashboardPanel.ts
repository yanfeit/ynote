import * as vscode from 'vscode';
import * as cheerio from 'cheerio';
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
        if (!msg || typeof msg !== 'object' || typeof msg.command !== 'string') {
          return;
        }

        if (msg.command === 'openUrl') {
          if (typeof msg.url === 'string') {
            vscode.env.openExternal(vscode.Uri.parse(msg.url));
          }
        } else if (msg.command === 'refresh') {
          await this.update();
        } else if (msg.command === 'saveComment') {
          if (typeof msg.id !== 'string' || typeof msg.comment !== 'string') {
            return;
          }

          const safeComment = this.sanitizeCommentHtml(msg.comment);
          try {
            await this.db.update(msg.id, { comment: safeComment });
            vscode.window.showInformationMessage('Comment saved.');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to save comment: ${message}`);
          }
        } else if (msg.command === 'pushToGithub') {
          await vscode.commands.executeCommand('ynote.syncToGithub');
        } else if (msg.command === 'pullFromGithub') {
          await vscode.commands.executeCommand('ynote.pullFromGithub');
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
        const safeCommentHtml = this.sanitizeCommentHtml(r.comment || '');
        const searchableComment = this.stripHtml(safeCommentHtml);
        const date = new Date(r.addedAt).toLocaleDateString();
        const author = r.author ? `<span class="author">By ${this.escapeHtml(r.author)}</span>` : '';
        const org = r.organization ? `<span class="org">${this.escapeHtml(r.organization)}</span>` : '';
        const meta = [author, org].filter(Boolean).join(' · ');
        const tags = r.tags.length > 0
          ? `<div class="tags">${r.tags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join(' ')}</div>`
          : '';
        // Show source only if it differs from organization (avoid duplication)
        const showSource = r.source && r.source !== r.organization;
        const hasComment = searchableComment.trim().length > 0;
        const commentPreview = hasComment
          ? `<div class="comment-preview"><span class="comment-label">💬 Note:</span> ${safeCommentHtml}</div>`
          : `<div class="comment-preview comment-placeholder">Click to add a note...</div>`;

        return `
          <div class="card" data-id="${this.escapeAttr(r.id)}" data-title="${this.escapeAttr(r.title)}" data-author="${this.escapeAttr(r.author)}" data-org="${this.escapeAttr(r.organization)}" data-abstract="${this.escapeAttr(r.abstract)}" data-tags="${this.escapeAttr(r.tags.join(' '))}" data-comment="${this.escapeAttr(searchableComment)}">
            <div class="card-header">
              <a href="#" class="title" data-url="${this.escapeAttr(r.url)}" onclick="event.stopPropagation(); openUrl(event.currentTarget.dataset.url)">${this.escapeHtml(r.title)}</a>
              <div class="card-header-right">
                <span class="date">${date}</span>
              </div>
            </div>
            ${meta ? `<div class="meta">${meta}</div>` : ''}
            ${r.abstract ? `<p class="abstract">${this.escapeHtml(r.abstract)}</p>` : ''}
            <div class="footer">
              ${showSource ? `<span class="source">${this.escapeHtml(r.source)}</span>` : ''}
              ${tags}
            </div>
            ${commentPreview}
            <div class="comment-panel" style="display: none;">
              <div class="comment-toolbar">
                <button type="button" class="toolbar-btn" onclick="event.stopPropagation(); execFormat('bold')" title="Bold (Ctrl+B)"><b>B</b></button>
                <button type="button" class="toolbar-btn" onclick="event.stopPropagation(); execFormat('italic')" title="Italic (Ctrl+I)"><i>I</i></button>
                <button type="button" class="toolbar-btn" onclick="event.stopPropagation(); execFormat('strikeThrough')" title="Strikethrough"><s>S</s></button>
                <div class="list-dropdown" onclick="event.stopPropagation()">
                  <button type="button" class="toolbar-btn" onclick="event.stopPropagation(); toggleListDropdown(this)" title="Insert list">☰ List ▾</button>
                  <div class="list-dropdown-menu" style="display: none;">
                    <button type="button" class="dropdown-item" onclick="event.stopPropagation(); execFormat('insertUnorderedList'); closeListDropdown(this)">• Bullet list</button>
                    <button type="button" class="dropdown-item" onclick="event.stopPropagation(); execFormat('insertOrderedList'); closeListDropdown(this)">1. Numbered list</button>
                  </div>
                </div>
                <button type="button" class="toolbar-btn save-btn" onclick="event.stopPropagation(); saveComment(this)" title="Save comment">Save</button>
              </div>
              <div class="comment-editor" contenteditable="true" onclick="event.stopPropagation()">${safeCommentHtml}</div>
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
      font-size: var(--vscode-font-size);
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
    .header-actions {
      margin-left: auto;
      display: flex;
      gap: 6px;
    }
    .header-btn {
      background: var(--vscode-button-secondaryBackground, rgba(127,127,127,0.2));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px;
      padding: 5px 10px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 0.85em;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .header-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(127,127,127,0.35));
    }
    .search-bar {
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 16px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
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
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .card:hover {
      border-color: var(--vscode-focusBorder);
    }
    .card.expanded {
      border-color: var(--vscode-focusBorder);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 6px;
    }
    .card-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
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
    /* Comment panel */
    .comment-panel {
      margin-top: 10px;
      border-top: 1px solid var(--vscode-editorWidget-border);
      padding-top: 10px;
    }
    .comment-toolbar {
      display: flex;
      gap: 4px;
      margin-bottom: 6px;
      flex-wrap: wrap;
      align-items: center;
    }
    .toolbar-btn {
      background: var(--vscode-button-secondaryBackground, rgba(127,127,127,0.2));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 3px;
      padding: 3px 8px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.4;
    }
    .toolbar-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(127,127,127,0.35));
    }
    .save-btn {
      margin-left: auto;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 600;
      border: none;
    }
    .save-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .comment-editor {
      min-height: 60px;
      max-height: 300px;
      overflow-y: auto;
      padding: 8px 10px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.5;
      outline: none;
    }
    .comment-editor:focus {
      border-color: var(--vscode-focusBorder);
    }
    .comment-editor ul, .comment-editor ol {
      margin: 4px 0;
      padding-left: 20px;
    }
    .comment-editor b, .comment-editor strong { font-weight: 700; }
    .comment-editor i, .comment-editor em { font-style: italic; }
    .comment-editor s, .comment-editor strike { text-decoration: line-through; }
    /* Comment preview on card */
    .comment-preview {
      margin-top: 10px;
      padding: 8px 10px;
      border-top: 1px solid var(--vscode-editorWidget-border);
      font-size: 0.9em;
      line-height: 1.5;
      color: var(--vscode-foreground);
      max-height: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .comment-preview.comment-placeholder {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      font-size: 0.85em;
    }
    .comment-label {
      font-weight: 600;
      font-size: 0.9em;
    }
    .comment-preview ul, .comment-preview ol {
      margin: 2px 0;
      padding-left: 18px;
    }
    .comment-preview b, .comment-preview strong { font-weight: 700; }
    .comment-preview i, .comment-preview em { font-style: italic; }
    .comment-preview s, .comment-preview strike { text-decoration: line-through; }
    /* List dropdown */
    .list-dropdown {
      position: relative;
      display: inline-block;
    }
    .list-dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      z-index: 100;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      min-width: 140px;
      padding: 4px 0;
    }
    .dropdown-item {
      display: block;
      width: 100%;
      padding: 6px 12px;
      background: none;
      border: none;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      text-align: left;
      cursor: pointer;
    }
    .dropdown-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>YNote Readings</h1>
    <span class="count">${readings.length} reading${readings.length !== 1 ? 's' : ''}</span>
    <div class="header-actions">
      <button class="header-btn" onclick="pullFromGithub()" title="Pull readings from GitHub">⬇ Pull</button>
      <button class="header-btn" onclick="pushToGithub()" title="Push readings to GitHub">⬆ Push</button>
    </div>
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
    function pushToGithub() {
      vscode.postMessage({ command: 'pushToGithub' });
    }
    function pullFromGithub() {
      vscode.postMessage({ command: 'pullFromGithub' });
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
    function toggleComment(card) {
      const panel = card.querySelector('.comment-panel');
      const preview = card.querySelector('.comment-preview');
      const isVisible = panel.style.display !== 'none';
      // Close all other open comment panels
      document.querySelectorAll('.card').forEach(c => {
        const p = c.querySelector('.comment-panel');
        const pr = c.querySelector('.comment-preview');
        if (p && c !== card) {
          p.style.display = 'none';
          if (pr) { pr.style.display = ''; }
          c.classList.remove('expanded');
        }
      });
      if (isVisible) {
        panel.style.display = 'none';
        if (preview) { preview.style.display = ''; }
        card.classList.remove('expanded');
      } else {
        panel.style.display = 'block';
        if (preview) { preview.style.display = 'none'; }
        card.classList.add('expanded');
        card.querySelector('.comment-editor').focus();
      }
    }
    function toggleListDropdown(btn) {
      const menu = btn.parentElement.querySelector('.list-dropdown-menu');
      const isOpen = menu.style.display !== 'none';
      // Close all dropdowns first
      document.querySelectorAll('.list-dropdown-menu').forEach(m => m.style.display = 'none');
      menu.style.display = isOpen ? 'none' : 'block';
    }
    function closeListDropdown(item) {
      item.closest('.list-dropdown-menu').style.display = 'none';
    }
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.list-dropdown')) {
        document.querySelectorAll('.list-dropdown-menu').forEach(m => m.style.display = 'none');
      }
    });
    function execFormat(cmd) {
      document.execCommand(cmd, false, null);
      // Re-focus the editor that's currently visible
      const expanded = document.querySelector('.card.expanded .comment-editor');
      if (expanded) { expanded.focus(); }
    }
    function sanitizeCommentHtml(html) {
      const template = document.createElement('template');
      template.innerHTML = html;
      const allowed = new Set(['b', 'strong', 'i', 'em', 's', 'strike', 'ul', 'ol', 'li', 'p', 'br', 'div', 'span', 'code']);

      const walk = (node) => {
        const children = Array.from(node.childNodes);
        for (const child of children) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child;
            const tag = el.tagName.toLowerCase();
            if (!allowed.has(tag)) {
              const text = document.createTextNode(el.textContent || '');
              node.replaceChild(text, el);
              continue;
            }

            Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name));
            walk(el);
          }
        }
      };

      walk(template.content);
      return template.innerHTML.trim();
    }
    function saveComment(btn) {
      const card = btn.closest('.card');
      const editor = card.querySelector('.comment-editor');
      const id = card.dataset.id;
      const comment = sanitizeCommentHtml(editor.innerHTML.trim());
      editor.innerHTML = comment;
      // Update the data attribute so search picks it up
      card.dataset.comment = editor.textContent || '';
      // Update the comment preview on the card
      const preview = card.querySelector('.comment-preview');
      if (comment && comment !== '<br>') {
        preview.innerHTML = '<span class="comment-label">💬 Note:</span> ' + comment;
        preview.classList.remove('comment-placeholder');
      } else {
        preview.innerHTML = 'Click to add a note...';
        preview.classList.add('comment-placeholder');
      }
      vscode.postMessage({ command: 'saveComment', id: id, comment: comment });
    }
    // Attach click handlers to cards
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', function() { toggleComment(this); });
    });
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
            card.dataset.tags,
            card.dataset.comment
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

  private sanitizeCommentHtml(rawHtml: string): string {
    if (!rawHtml) {
      return '';
    }

    const allowedTags = new Set(['b', 'strong', 'i', 'em', 's', 'strike', 'ul', 'ol', 'li', 'p', 'br', 'div', 'span', 'code']);
    const $ = cheerio.load(`<div id="__ynote_root">${rawHtml}</div>`);
    const root = $('#__ynote_root');

    root.find('*').each((_idx, el) => {
      const tagName = (el as { tagName?: string }).tagName?.toLowerCase() || '';
      if (!allowedTags.has(tagName)) {
        $(el).replaceWith($(el).text());
        return;
      }

      const attrs = Object.keys((el as { attribs?: Record<string, string> }).attribs || {});
      for (const attr of attrs) {
        $(el).removeAttr(attr);
      }
    });

    return root.html() || '';
  }

  private stripHtml(rawHtml: string): string {
    const $ = cheerio.load(rawHtml || '');
    return $.text().replace(/\s+/g, ' ').trim();
  }
}
