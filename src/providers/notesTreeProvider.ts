import * as vscode from 'vscode';
import { NoteDb } from '../database/noteDb';
import { Note } from '../models/note';

type TreeElement = PinnedNotesGroup | NoteYearMonthGroup | NoteItem | NoteDetail;

export class NotesTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private notes: Note[] = [];

  constructor(private db: NoteDb) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) {
      try {
        this.notes = await this.db.getAll();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return [new NoteDetail('Error', `Failed to load notes: ${message}`)];
      }

      const pinned = this.notes.filter(n => n.pinned);
      const unpinned = this.notes.filter(n => !n.pinned);

      const result: TreeElement[] = [];

      // Pinned section (flat, always expanded, no collapsible)
      if (pinned.length > 0) {
        result.push(new PinnedNotesGroup(pinned));
      }

      // Group unpinned by year-month
      const groups = new Map<string, Note[]>();
      for (const n of unpinned) {
        const d = new Date(n.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!groups.has(key)) { groups.set(key, []); }
        groups.get(key)!.push(n);
      }
      const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));
      for (const key of sortedKeys) {
        result.push(new NoteYearMonthGroup(key, groups.get(key)!));
      }

      return result;
    }

    if (element instanceof PinnedNotesGroup) {
      return element.notes.map(n => new NoteItem(n));
    }

    if (element instanceof NoteYearMonthGroup) {
      return element.notes.map(n => new NoteItem(n));
    }

    if (element instanceof NoteItem) {
      const n = element.note;
      const details: NoteDetail[] = [];
      if (n.tags.length > 0) { details.push(new NoteDetail('Tags', n.tags.join(', '))); }
      return details;
    }

    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }
}

class PinnedNotesGroup extends vscode.TreeItem {
  constructor(public readonly notes: Note[]) {
    super('Pinned', vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
    this.tooltip = 'Pinned notes';
    this.contextValue = 'pinnedNotesGroup';
    this.iconPath = new vscode.ThemeIcon('pinned');
  }
}

class NoteYearMonthGroup extends vscode.TreeItem {
  constructor(
    public readonly yearMonth: string,
    public readonly notes: Note[]
  ) {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    super(yearMonth, yearMonth === currentYM ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
    this.tooltip = `Notes created in ${yearMonth}`;
    this.contextValue = 'noteYearMonthGroup';
    this.iconPath = new vscode.ThemeIcon('calendar');
  }
}

export class NoteItem extends vscode.TreeItem {
  constructor(public readonly note: Note) {
    const date = new Date(note.updatedAt).toLocaleDateString();
    const hasChildren = note.tags.length > 0;
    super(note.title, hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.description = date;
    this.tooltip = `${note.title}\nUpdated: ${new Date(note.updatedAt).toLocaleString()}`;
    this.contextValue = note.pinned ? 'pinnedNote' : 'note';
    this.iconPath = new vscode.ThemeIcon(note.pinned ? 'pinned' : 'note');
    this.command = {
      command: 'ynote.openNote',
      title: 'Open Note',
      arguments: [this],
    };
  }
}

class NoteDetail extends vscode.TreeItem {
  constructor(label: string, value: string) {
    super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
    this.tooltip = value;
    this.contextValue = 'noteDetail';

    if (label === 'Created' || label === 'Updated') {
      this.iconPath = new vscode.ThemeIcon('clock');
    } else if (label === 'Tags') {
      this.iconPath = new vscode.ThemeIcon('tag');
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}
