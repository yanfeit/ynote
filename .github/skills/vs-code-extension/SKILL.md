---
name: vs-code-extension
description: 'TypeScript VS Code extension development workflow. Use for compiling, packaging, installing, testing, debugging, and releasing VS Code extensions. Covers tsconfig setup, .vscodeignore, vsce packaging, mocha unit tests, Extension Host debugging, Remote SSH deployment, and git release workflow.'
---

# VS Code Extension Development (TypeScript)

## When to Use
- Compiling or building a VS Code extension written in TypeScript
- Packaging to `.vsix` for distribution
- Installing or reinstalling the extension locally (including Remote SSH/WSL)
- Writing or running unit tests and integration tests
- Debugging activation failures, missing commands, or runtime errors
- Managing version bumps and git releases

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

# Or: VS Code GUI — Extensions sidebar → ... → Install from VSIX...
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
- For modules that import `vscode`, mock the `vscode` module (see [mock template](./references/vscode-mock-pattern.md))
- For pure logic (parsing, DB), test directly without mocking

### Integration Tests (Extension Host)
- Press `F5` to launch Extension Development Host
- Debug console shows extension activation errors
- `Ctrl+Shift+P` → "Developer: Toggle Developer Tools" → Console tab for runtime errors

## Debugging

### Extension Not Activating
1. `Ctrl+Shift+P` → "Developer: Toggle Developer Tools" → Console
2. Look for `Activating extension 'yanfeit.ynote' failed`
3. Common cause: missing `node_modules/` in installed extension

### Commands Not Found
- Extension failed to activate → commands never registered
- Fix the activation error first (usually a missing dependency or syntax error)

### Remote SSH Issues
- `extensionKind: ["workspace"]` in `package.json` — runs extension on remote
- Extensions install to `~/.vscode-server/extensions/` on remote
- Use `code --install-extension` from the remote terminal

## Release Workflow

See [release checklist](./references/release-checklist.md) for the full process.

```bash
# 1. Update version in package.json
# 2. Update CHANGELOG.md
# 3. Compile, test, package
npm run compile && npm test
npx @vscode/vsce package
# 4. Commit, tag, push
git add -A && git commit -m "v0.x.y: description

Co-authored-by: Claude Code <noreply@anthropic.com>"
git tag v0.x.y
git push origin main --tags
```

## Key Conventions
- `engines.vscode` must match `@types/vscode` version
- `activationEvents: []` — VS Code infers from contributes (commands, views)
- `extensionKind: ["workspace"]` for extensions that access filesystem or run processes
- Use `context.globalStorageUri` for persistent data
- Always escape HTML in webview content (XSS prevention)
- Set CSP headers on webview HTML
