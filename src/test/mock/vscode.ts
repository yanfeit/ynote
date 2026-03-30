// Mock for the 'vscode' module used in unit tests outside Extension Host.
// This provides the minimum API surface that our code uses.

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
  parse: (uri: string) => ({ fsPath: uri, scheme: 'file', path: uri }),
};

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(key: string, defaultValue: T): T => defaultValue,
  }),
};

export const window = {
  showInformationMessage: async (..._args: unknown[]) => undefined,
  showWarningMessage: async (..._args: unknown[]) => undefined,
  showErrorMessage: async (..._args: unknown[]) => undefined,
  showInputBox: async (_options?: unknown) => undefined,
  withProgress: async (_options: unknown, task: () => Promise<unknown>) => task(),
  createTreeView: () => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
};

export const env = {
  openExternal: async (_uri: unknown) => true,
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  iconPath?: unknown;
  collapsibleState?: TreeItemCollapsibleState;
  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export enum ProgressLocation {
  Notification = 15,
}

export class EventEmitter {
  event = () => {};
  fire() {}
  dispose() {}
}

export class ExtensionContext {
  globalStorageUri = Uri.file('/tmp/ynote-test');
  subscriptions: { dispose: () => void }[] = [];
}
