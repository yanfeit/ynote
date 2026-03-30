# VS Code Mock Pattern for Unit Testing

When unit testing modules that import `vscode`, the `vscode` module is not available outside Extension Host. Create a mock module and register it before running tests.

## Mock Implementation

```typescript
// src/test/mock/vscode.ts
const vscode = {
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
    joinPath: (base: any, ...segments: string[]) => ({
      fsPath: require('path').join(base.fsPath, ...segments),
      scheme: 'file',
    }),
  },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultValue?: any) => defaultValue,
    }),
    fs: {
      createDirectory: async () => {},
      readFile: async () => Buffer.from('[]'),
      writeFile: async () => {},
    },
  },
  window: {
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showInputBox: async () => undefined,
    withProgress: async (_options: any, task: any) => task({ report: () => {} }),
  },
  ProgressLocation: { Notification: 15 },
  commands: { executeCommand: async () => {} },
  env: { openExternal: async () => true },
};

module.exports = vscode;
```

## Registration (before test imports)

```typescript
// At top of test file, before importing module under test
import * as Module from 'module';
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return require('./mock/vscode');
  }
  return originalRequire.apply(this, arguments as any);
};
```

## When to Mock vs. When Not To
- **Mock**: Commands, tree providers, webview panels — anything that uses `vscode.*` APIs
- **Don't mock**: Pure data logic (JSON parsing, metadata extraction, URL manipulation)
