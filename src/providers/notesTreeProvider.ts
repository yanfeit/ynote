import * as vscode from 'vscode';
import { NoteDb } from '../database/noteDb';
import { Note } from '../models/note';

type TreeElement = NoteYearMonthGroup | NoteItem | NoteDetail;

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

      // Group by year-month based on createdAt
      const groups = new Map<string, Note[]>();
      for (const n of this.notes) {
        const d = new Date(n.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!groups.has(key)) { groups.set(key, []); }
        groups.get(key)!.push(n);
      }
      // Sort year-month keys descending (newest first)
      const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));
      return sortedKeys.map(key => new NoteYearMonthGroup(key, groups.get(key)!));
    }

    if (element instanceof NoteYearMonthGroup) {
      return element.notes.map(n => new NoteItem(n));
    }

    if (element instanceof NoteItem) {
      const n = element.note;
      const details: NoteDetail[] = [];
      const created = new Date(n.createdAt).toLocaleString();
      const updated = new Date(n.updatedAt).toLocaleString();
      details.push(new NoteDetail('Created', created));
      if (n.updatedAt !== n.createdAt) {
        details.push(new NoteDetail('Updated', updated));
      }
      if (n.tags.length > 0) { details.push(new NoteDetail('Tags', n.tags.join(', '))); }
      return details;
    }

    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }
}

class NoteYearMonthGroup extends vscode.TreeItem {
  constructor(
    public readonly yearMonth: string,
    public readonly notes: Note[]
  ) {
    super(yearMonth, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
    this.tooltip = `Notes created in ${yearMonth}`;
    this.contextValue = 'noteYearMonthGroup';
    this.iconPath = new vscode.ThemeIcon('calendar');
  }
}

export class NoteItem extends vscode.TreeItem {
  constructor(public readonly note: Note) {
    const date = new Date(note.updatedAt).toLocaleDateString();
    super(note.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = date;
    this.tooltip = `${note.title}\nUpdated: ${new Date(note.updatedAt).toLocaleString()}`;
    this.contextValue = 'note';
    this.iconPath = new vscode.ThemeIcon('note');
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
