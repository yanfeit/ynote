# CLAUDE.md — YNote Project Context

## Project Overview
**YNote** is a VS Code Extension for maintaining a private reading record system. It lets users paste URLs (blog posts, articles, news), auto-extracts metadata (title, author, organization, abstract), stores records in a JSON database, and syncs to a private GitHub repo.

## Architecture

### Extension Type
- VS Code Extension (TypeScript, Node.js runtime)
- Cross-platform: Linux (primary), Windows (supported)

### Data Storage
- **Format**: JSON file (`readings.json`) — chosen for git-friendly diffs and human readability
- **Location**: `context.globalStorageUri` (VS Code managed, persists across sessions)
- **Sync**: Manual git push/pull to a private GitHub repo configured in settings

### Key Dependencies
- `axios` — HTTP requests for fetching web pages
- `cheerio` — Lightweight HTML parsing for metadata extraction
- `uuid` — Unique record ID generation

### Source Structure
```
src/
├── extension.ts              # Entry point: activate/deactivate
├── models/
│   └── reading.ts            # Reading interface definition
├── database/
│   └── jsonDb.ts             # JSON file CRUD operations
├── services/
│   ├── metadataFetcher.ts    # URL → metadata extraction (axios + cheerio)
│   └── gitSync.ts            # Git CLI wrapper for GitHub sync
├── commands/
│   ├── addReading.ts         # Add reading from URL
│   └── syncToGithub.ts       # Trigger git sync
├── providers/
│   └── readingsTreeProvider.ts  # Sidebar tree view data provider
└── webview/
    ├── DashboardPanel.ts     # Webview panel lifecycle
    ├── dashboard.html        # Dashboard UI template
    └── dashboard.css         # Dashboard styles
```

## Build & Development Commands
```bash
npm run compile      # Compile TypeScript → out/
npm run watch        # Watch mode compilation
npm run lint         # Type-check without emit
```

### Running the Extension
- Press `F5` in VS Code to launch Extension Development Host
- Or: `code --extensionDevelopmentPath=/home/yanfeit/projects/ynote`

### Packaging
```bash
npx @vscode/vsce package   # Produces .vsix file
```

## Coding Conventions
- **Language**: TypeScript with strict mode
- **Module system**: CommonJS (required by VS Code extensions)
- **Target**: ES2020
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces/types
- **Error handling**: Always catch and show user-friendly messages via `vscode.window.showErrorMessage()`
- **Async**: Use async/await, never raw callbacks
- **Imports**: Use named imports, group by: vscode → node builtins → external deps → local modules

## Design Decisions
1. **JSON over SQLite** — git-friendly diffs, human-readable, sufficient for personal use (<5K records)
2. **Manual sync over auto-sync** — user triggers `ynote.syncToGithub` explicitly, no surprise pushes
3. **Git CLI over GitHub API** — simpler implementation, leverages existing user git auth (SSH/credential helper)
4. **cheerio over puppeteer** — lightweight (~50KB vs ~300MB), sufficient for `<meta>` tag extraction
5. **globalStorageUri** — VS Code managed path, safe across OS, survives extension updates

## Configuration Settings
| Setting | Default | Description |
|---------|---------|-------------|
| `ynote.githubRepoUrl` | `""` | Private GitHub repo URL for sync |
| `ynote.maxAbstractLength` | `500` | Max extracted abstract length |
| `ynote.fallbackDescriptionLength` | `100` | Fallback description length |
| `ynote.fetchTimeout` | `10000` | HTTP fetch timeout (ms) |

## Extension Commands
| Command | Keybinding | Description |
|---------|------------|-------------|
| `ynote.addReading` | `Ctrl+Shift+Y` | Paste URL, extract metadata, save |
| `ynote.removeReading` | — | Remove selected reading |
| `ynote.openReading` | — | Open URL in browser |
| `ynote.showDashboard` | — | Open webview dashboard |
| `ynote.syncToGithub` | — | Commit and push to GitHub |
| `ynote.refreshReadings` | — | Refresh tree view |
