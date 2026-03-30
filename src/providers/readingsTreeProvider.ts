import * as vscode from 'vscode';
import { JsonDb } from '../database/jsonDb';
import { Reading } from '../models/reading';

type TreeElement = ReadingItem | ReadingDetail;

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
      this.readings = await this.db.getAll();
      return this.readings.map(r => new ReadingItem(r));
    }

    if (element instanceof ReadingItem) {
      const r = element.reading;
      const details: ReadingDetail[] = [];
      if (r.author) { details.push(new ReadingDetail('Author', r.author)); }
      if (r.organization) { details.push(new ReadingDetail('Org', r.organization)); }
      if (r.abstract) { details.push(new ReadingDetail('Abstract', r.abstract)); }
      if (r.source) { details.push(new ReadingDetail('Source', r.source)); }
      details.push(new ReadingDetail('URL', r.url));
      return details;
    }

    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
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
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}
