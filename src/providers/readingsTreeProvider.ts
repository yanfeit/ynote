import * as vscode from 'vscode';
import { JsonDb } from '../database/jsonDb';
import { Reading } from '../models/reading';

type TreeElement = YearMonthGroup | ReadingItem | ReadingDetail;

export class ReadingsTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readings: Reading[] = [];

  constructor(private db: JsonDb) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) {
      try {
        this.readings = await this.db.getAll();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return [new ReadingDetail('Error', `Failed to load readings: ${message}`)];
      }

      // Group by year-month
      const groups = new Map<string, Reading[]>();
      for (const r of this.readings) {
        const d = new Date(r.addedAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!groups.has(key)) { groups.set(key, []); }
        groups.get(key)!.push(r);
      }
      // Sort year-month keys descending (newest first)
      const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));
      return sortedKeys.map(key => new YearMonthGroup(key, groups.get(key)!));
    }

    if (element instanceof YearMonthGroup) {
      return element.readings.map(r => new ReadingItem(r));
    }

    if (element instanceof ReadingItem) {
      const r = element.reading;
      const details: ReadingDetail[] = [];
      if (r.author) { details.push(new ReadingDetail('Author', r.author)); }
      if (r.organization) { details.push(new ReadingDetail('Org', r.organization)); }
      if (r.abstract) { details.push(new ReadingDetail('Abstract', r.abstract)); }
      if (r.source && r.source !== r.organization) { details.push(new ReadingDetail('Source', r.source)); }
      if (r.tags.length > 0) { details.push(new ReadingDetail('Tags', r.tags.join(', '))); }
      details.push(new ReadingDetail('URL', r.url));
      return details;
    }

    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }
}

class YearMonthGroup extends vscode.TreeItem {
  constructor(
    public readonly yearMonth: string,
    public readonly readings: Reading[]
  ) {
    super(yearMonth, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${readings.length} reading${readings.length !== 1 ? 's' : ''}`;
    this.tooltip = `Readings added in ${yearMonth}`;
    this.contextValue = 'yearMonthGroup';
    this.iconPath = new vscode.ThemeIcon('calendar');
  }
}

export class ReadingItem extends vscode.TreeItem {
  constructor(public readonly reading: Reading) {
    const date = new Date(reading.addedAt).toLocaleDateString();
    super(reading.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = date;
    this.tooltip = `${reading.title}\n${reading.author ? 'By ' + reading.author : ''}\n${reading.abstract}`;
    this.contextValue = 'reading';
    this.iconPath = new vscode.ThemeIcon('bookmark');
  }
}

class ReadingDetail extends vscode.TreeItem {
  constructor(label: string, value: string) {
    super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
    this.tooltip = value;
    this.contextValue = 'readingDetail';

    if (label === 'URL') {
      this.iconPath = new vscode.ThemeIcon('link');
    } else if (label === 'Author') {
      this.iconPath = new vscode.ThemeIcon('person');
    } else if (label === 'Org') {
      this.iconPath = new vscode.ThemeIcon('organization');
    } else if (label === 'Abstract') {
      this.iconPath = new vscode.ThemeIcon('note');
    } else if (label === 'Tags') {
      this.iconPath = new vscode.ThemeIcon('tag');
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}
