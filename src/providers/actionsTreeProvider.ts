import * as vscode from 'vscode';

type ActionElement = ActionItem;

export class ActionsTreeProvider implements vscode.TreeDataProvider<ActionElement> {
  getChildren(): ActionElement[] {
    return [
      new ActionItem('Settings', 'gear', 'ynote.openSettings'),
      new ActionItem('Push to GitHub', 'cloud-upload', 'ynote.syncToGithub'),
      new ActionItem('Pull from GitHub', 'cloud-download', 'ynote.pullFromGithub'),
    ];
  }

  getTreeItem(element: ActionElement): vscode.TreeItem {
    return element;
  }
}

class ActionItem extends vscode.TreeItem {
  constructor(label: string, iconId: string, commandId: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.command = {
      command: commandId,
      title: label,
    };
    this.contextValue = 'action';
  }
}
