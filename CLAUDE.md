# CLAUDE.md — YNote Project Context

## Design Principles

Researchers track the progress of their peers through literature review, and literature management tools have emerged as a targeted solution to systematically address the pain points of collecting, organizing, and retrieving academic literature. For modern developers — especially those working in the artificial intelligence (AI) field — they routinely obtain fragmented updates on cutting-edge industry trends, technical solutions, and open-source project information through multiple channels, including official announcements, WeChat Official Account articles, technical blogs, X (formerly Twitter), and GitHub repositories. Yet they have long lacked a dedicated information management tool that is lightweight and tailored to developers' usage habits.

YNote is a lightweight note-taking plugin for information management built for developers (especially AI practitioners). It focuses on the full lifecycle management of fragmented industry information, providing users with one-stop capabilities for information collection, structured organization, and efficient indexed retrieval.

## Project Overview
**YNote** is a VS Code Extension for maintaining a private reading record system. It lets users paste URLs (blog posts, articles, news), auto-extracts metadata (title, author, organization, abstract), stores records in a JSON database, and syncs to a private GitHub repo.

## Framework / Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension Host                    │
│                                                                  │
│  ┌──────────────┐     ┌───────────────────┐                      │
│  │ User Input   │────▶│ addReading.ts      │                     │
│  │ (Ctrl+Shift+Y│     │ command handler    │                     │
│  │  or sidebar) │     └────────┬──────────┘                      │
│  └──────────────┘              │                                 │
│                                ▼                                 │
│                   ┌───────────────────────┐                      │
│                   │ metadataFetcher.ts     │                     │
│                   │ axios GET → cheerio   │                      │
│                   │ parse <meta>, JSON-LD │                      │
│                   └────────┬──────────────┘                      │
│                            │ Partial<Reading>                    │
│                            ▼                                     │
│                   ┌───────────────────────┐                      │
│                   │ jsonDb.ts             │                      │
│                   │ CRUD → readings.json  │                      │
│                   │ (globalStorageUri)    │                      │
│                   └────────┬──────────────┘                      │
│                            │                                     │
│              ┌─────────────┼─────────────┐                       │
│              ▼             ▼             ▼                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ Tree View    │ │ Dashboard    │ │ gitSync.ts   │             │
│  │ (sidebar)    │ │ (webview)    │ │ git CLI      │             │
│  │ newest-first │ │ cards+search │ │ push/pull    │             │
│  └──────────────┘ └──────────────┘ └──────┬───────┘             │
│                                           │                      │
└───────────────────────────────────────────┼──────────────────────┘
                                            ▼
                                   ┌─────────────────┐
                                   │ Private GitHub   │
                                   │ Repo (remote)    │
                                   └─────────────────┘
```

### Component Responsibilities
| Component | File | Role |
|-----------|------|------|
| **Entry point** | `extension.ts` | Registers commands, tree view, wires dependencies |
| **Data model** | `models/reading.ts` | `Reading` interface (id, url, title, author, org, abstract, dates, tags) |
| **Database** | `database/jsonDb.ts` | JSON file CRUD, sorted newest-first, dedup by URL |
| **Fetcher** | `services/metadataFetcher.ts` | URL → HTML → extract title/author/org/abstract via cheerio |
| **Sync** | `services/gitSync.ts` | Clone, pull, merge, commit, push via git CLI |
| **Add command** | `commands/addReading.ts` | URL input → fetch → confirm → save → refresh UI |
| **Sync command** | `commands/syncToGithub.ts` | Trigger sync with progress + error UI |
| **Tree view** | `providers/readingsTreeProvider.ts` | Sidebar list with expandable details |
| **Dashboard** | `webview/DashboardPanel.ts` | HTML card layout with inline search |

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

## Testing
```bash
npm test             # Run unit tests (mocha)
```
- Unit tests: `src/test/jsonDb.test.ts`, `src/test/metadataFetcher.test.ts`
- Integration: `src/test/integration/extension.test.ts` (runs in Extension Host via F5)
- Tests mock `vscode` module for unit testing outside Extension Host

## Skills Reference
See `.github/skills/vs-code-extension/SKILL.md` for detailed workflows on compiling, packaging, installing, testing, and debugging. The skill includes reference docs for TypeScript standards, vscode mock patterns, and release checklists.
