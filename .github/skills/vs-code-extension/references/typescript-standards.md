# TypeScript Coding Standards for VS Code Extensions

## Language Configuration
- **Target**: ES2020 (async/await, optional chaining, nullish coalescing)
- **Module**: CommonJS (required by VS Code extension host)
- **Strict mode**: Always enabled

## Naming Conventions
| Element | Style | Example |
|---------|-------|---------|
| Variables, functions | camelCase | `fetchMetadata`, `dbPath` |
| Classes, interfaces, types | PascalCase | `Reading`, `JsonDb`, `DashboardPanel` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| File names | camelCase | `metadataFetcher.ts`, `jsonDb.ts` |
| Test files | camelCase + `.test` | `jsonDb.test.ts` |

## Import Order
1. `vscode` module
2. Node.js built-ins (`path`, `fs`, `child_process`)
3. External packages (`axios`, `cheerio`, `uuid`)
4. Local modules (relative paths)

Separate groups with a blank line.

## Error Handling
- Show user-friendly messages via `vscode.window.showErrorMessage()`
- Log technical details to console for developer debugging
- Use `try/catch` around all async operations
- Provide fallback behavior when possible (e.g., "Save URL Only" on fetch failure)

## Async Patterns
- Use `async/await` exclusively — never raw callbacks or `.then()` chains
- Long operations must show progress: `vscode.window.withProgress()`
- Avoid fire-and-forget promises — always `await` or explicitly handle

## Security
- Escape all HTML in webview content to prevent XSS
- Set Content Security Policy headers on webview HTML
- Validate URLs before HTTP requests
- Never execute arbitrary user input as code or commands
