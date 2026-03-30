# SKILL.md — VS Code Extension Development

## Build & Compile

### TypeScript Compilation
```bash
npm run compile      # One-shot compile (tsc -p ./)
npm run watch        # Watch mode — recompiles on file save
npm run lint         # Type-check only, no output
```
- Source: `src/**/*.ts` → Output: `out/**/*.js`
- Config: `tsconfig.json` (target ES2020, module commonjs, strict mode)
- Always run `npm run compile` before packaging; the `vscode:prepublish` script does this automatically.

### Common Compile Errors
| Error | Fix |
|-------|-----|
| `Cannot find module 'vscode'` | `npm install -D @types/vscode`; `vscode` must be in `devDependencies` |
| `Cannot write file ... would overwrite input` | Delete `out/` folder: `rm -rf out && npm run compile` |
| `@types/vscode > engines.vscode` | Match `engines.vscode` in package.json to `@types/vscode` version |

## Packaging & Installation

### Package to .vsix
```bash
npx @vscode/vsce package        # Includes node_modules (production deps)
```
- **Critical**: `.vscodeignore` must NOT exclude `node_modules/` — runtime deps (axios, cheerio, uuid) must be in the .vsix.
- **Do** exclude: `src/`, `tsconfig.json`, `*.vsix`, `.vscode-test/`, test files.
- The `--no-dependencies` flag skips npm install inside the package step; safe only if `node_modules/` is already complete.

### Install Locally
```bash
# CLI (works for Remote SSH too)
code --install-extension ./ynote-0.1.0.vsix --force

# Or: VS Code GUI
# Extensions sidebar → ... → Install from VSIX...
```

### Verify Installation
```bash
code --list-extensions | grep ynote              # Should show: yanfeit.ynote
ls ~/.vscode-server/extensions/ | grep ynote     # Remote SSH
ls ~/.vscode/extensions/ | grep ynote            # Local
```

### After Code Changes (rebuild & reinstall)
```bash
npm run compile
npx @vscode/vsce package
code --install-extension ynote-*.vsix --force
# Then: Ctrl+Shift+P → Reload Window
```

## Testing

### Unit Tests (Mocha)
```bash
npm test             # Runs mocha on out/test/**/*.test.js
```
- Test files: `src/test/**/*.test.ts`
- For modules that import `vscode`, mock the `vscode` module (it's not available outside Extension Host)
- For pure logic (parsing, DB), test directly without mocking

### Integration Tests (Extension Host)
- Press `F5` to launch Extension Development Host
- The debug console shows extension activation errors
- Use `Ctrl+Shift+P` → "Developer: Toggle Developer Tools" → Console tab for runtime errors

### Test Structure
```
src/test/
├── jsonDb.test.ts              # Database CRUD with temp files
├── metadataFetcher.test.ts     # HTML parsing with fixture strings
└── integration/
    └── extension.test.ts       # Full command execution in Extension Host
```

## Debugging

### Extension Not Activating
1. Check `Ctrl+Shift+P` → "Developer: Toggle Developer Tools" → Console
2. Look for `Activating extension 'yanfeit.ynote' failed`
3. Common cause: missing `node_modules/` in installed extension

### Commands Not Found
- Extension failed to activate → commands never registered
- Fix the activation error first (usually a missing dependency or syntax error in compiled JS)

### Remote SSH Issues
- `extensionKind: ["workspace"]` in `package.json` ensures it runs on the remote
- Extensions install to `~/.vscode-server/extensions/` on the remote machine
- Use `code --install-extension` from the remote terminal, not local

## Git Workflow
```bash
git add -A
git commit -m "description of change"
git push origin main
```

### Version Bump for New Release
1. Update `version` in `package.json`
2. Add entry to `CHANGELOG.md`
3. Update `PROGRESS.md`
4. Commit, tag, push:
```bash
git add -A && git commit -m "v0.2.0: description"
git tag v0.2.0
git push origin main --tags
```

## Key Conventions
- `package.json` → `engines.vscode` must match `@types/vscode` version
- `activationEvents: []` means activate on any contributed command/view (VS Code infers)
- `extensionKind: ["workspace"]` for extensions that access filesystem or run processes
- Use `context.globalStorageUri` for persistent data (not `workspaceState` or `globalState` for large data)
- Always escape HTML in webview content to prevent XSS
- Set CSP headers on webview HTML
