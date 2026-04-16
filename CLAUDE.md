# CLAUDE.md — YNote Project Context

## Design Principles

Researchers track the progress of their peers through literature review, and literature management tools have emerged as a targeted solution to systematically address the needs of collecting, organizing, and retrieving academic literature. For modern developers — especially those working in the artificial intelligence (AI) field — they routinely obtain fragmented updates on cutting-edge industry trends, technical solutions, and open-source project information through multiple channels, including official announcements, WeChat Official Account articles, technical blogs, X (formerly Twitter), and GitHub repositories. 

YNote is a lightweight note-taking plugin for information management built for developers (especially AI practitioners). It focuses on the full lifecycle management of fragmented industry information, providing users with one-stop capabilities for information collection, structured organization, and efficient indexed retrieval.

## Project Overview
**YNote** is a VS Code Extension for maintaining a private reading record and note-taking system. It lets users:
- Paste URLs (blog posts, articles, news) and auto-extract metadata (title, author, organization, abstract)
- Create free-form Markdown notes with YAML front matter
- Organize both via tags, search, and year-month grouping
- Sync everything to a private GitHub repo

## Framework / Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                        VS Code Extension Host                        │
│                                                                      │
│  ┌──────────────┐     ┌───────────────────┐                          │
│  │ User Input   │────▶│ addReading.ts      │                         │
│  │ (Ctrl+Shift+Y│     │ command handler    │                         │
│  │  or sidebar) │     └────────┬──────────┘                          │
│  └──────────────┘              │                                     │
│                                ▼                                     │
│                   ┌───────────────────────┐                          │
│  ┌──────────┐    │ metadataFetcher.ts     │                          │
│  │ Create   │    │ axios GET → cheerio    │                          │
│  │ Note     │    │ parse <meta>, JSON-LD  │                          │
│  │ command  │    └────────┬──────────────┘                           │
│  └────┬─────┘            │ Partial<Reading>                          │
│       │                  ▼                                           │
│       │     ┌───────────────────────┐                                │
│       │     │ jsonDb.ts             │                                │
│       │     │ CRUD → readings.json  │                                │
│       │     │ (globalStorageUri)    │                                │
│       │     └────────┬──────────────┘                                │
│       │              │                                               │
│       ▼              │                                               │
│  ┌───────────────┐   │                                               │
│  │ noteDb.ts     │   │                                               │
│  │ CRUD → .md    │   │                                               │
│  │ (YAML front   │   │                                               │
│  │  matter)      │   │                                               │
│  └────┬──────────┘   │                                               │
│       │              │                                               │
│       ▼              ▼                                               │
│  ┌──────────────────────────────────────────────────┐                │
│  │              Context Menu Commands               │                │
│  │    cut / copy / rename / delete / download       │                │
│  │    (contextMenu.ts — shared for both types)      │                │
│  └──────────────────┬───────────────────────────────┘                │
│                     │                                                │
│       ┌─────────────┼──────────────┬───────────────┐                 │
│       ▼             ▼              ▼               ▼                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐            │
│  │ Readings │ │ Notes    │ │ Dashboard    │ │ gitSync  │            │
│  │ TreeView │ │ TreeView │ │ (webview)    │ │ .ts      │            │
│  │ (sidebar)│ │ (sidebar)│ │ cards+search │ │ push/pull│            │
│  └──────────┘ └──────────┘ └──────────────┘ └────┬─────┘            │
│       ↑             ↑                             │                  │
│       └─── Push/Pull buttons in both ────────────┘                   │
│            sidebar title bars                                        │
└──────────────────────────────────────────┬───────────────────────────┘
                                           ▼
                                  ┌─────────────────┐
                                  │ Private GitHub   │
                                  │ Repo (remote)    │
                                  │ readings/*.json  │
                                  │ notes/*.md       │
                                  └─────────────────┘
```

### Component Responsibilities
| Component | File | Role |
|-----------|------|------|
| **Entry point** | `extension.ts` | Registers 23 commands, 2 tree views, file watcher, wires dependencies |
| **Data models** | `models/reading.ts`, `models/note.ts` | `Reading` interface (11 fields) and `Note` interface (6 fields) |
| **Readings DB** | `database/jsonDb.ts` | JSON file CRUD, sorted newest-first, dedup by URL, mutation lock, atomic writes |
| **Notes DB** | `database/noteDb.ts` | Markdown files with YAML front matter, title-based filenames, auto-migration from UUID names |
| **Fetcher** | `services/metadataFetcher.ts` | URL → HTML → extract title/author/org/abstract via cheerio (OG, JSON-LD, meta, paragraph fallback); content keyword extraction |
| **Sync** | `services/gitSync.ts` | Clone/pull/push via git CLI; per-entry JSON files for readings, raw `.md` for notes; diff-based sync |
| **Add command** | `commands/addReading.ts` | URL input → fetch → confirm → tag → save → refresh UI |
| **Sync commands** | `commands/syncToGithub.ts` | Push/pull with progress notification + error UI |
| **Context menus** | `commands/contextMenu.ts` | Cut, Copy, Rename, Permanent Delete, Download — for both readings and notes |
| **Readings tree** | `providers/readingsTreeProvider.ts` | Year-month groups → reading items → detail rows (author, org, abstract, source, tags, URL) |
| **Notes tree** | `providers/notesTreeProvider.ts` | Year-month groups → note items → tag details |
| **Dashboard** | `webview/DashboardPanel.ts` | HTML card layout with inline search, rich-text comment editor, year-month sections |

## Architecture

### Extension Type
- VS Code Extension (TypeScript, Node.js runtime)
- Cross-platform: Linux (primary), Windows (supported)

### Data Storage
- **Readings**: JSON file (`readings.json`) in `context.globalStorageUri` — git-friendly diffs, human-readable
- **Notes**: Individual Markdown files (`{sanitized-title}.md`) in `globalStorageUri/notes/` — YAML front matter for metadata, body for content
- **Sync**: Manual git push/pull to a private GitHub repo; readings as individual `readings/{id}.json` files, notes as `notes/{title}.md` files

### Key Dependencies
- `axios` — HTTP requests for fetching web pages
- `cheerio` — Lightweight HTML parsing for metadata extraction and comment sanitization
- `uuid` — Unique record ID generation

### Source Structure
```
src/
├── extension.ts                 # Entry point: activate/deactivate, 23 command registrations
├── models/
│   ├── reading.ts               # Reading interface (id, url, title, author, org, abstract, dates, tags, source, comment)
│   └── note.ts                  # Note interface (id, title, createdAt, updatedAt, tags, filePath)
├── database/
│   ├── jsonDb.ts                # Readings JSON CRUD (mutation lock, atomic writes)
│   └── noteDb.ts                # Notes Markdown CRUD (YAML front matter, title-based filenames, migration)
├── services/
│   ├── metadataFetcher.ts       # URL → metadata extraction + content keyword suggestion
│   └── gitSync.ts               # Git CLI wrapper: diff-based push, pull, per-entry files, notes sync
├── commands/
│   ├── addReading.ts            # Add reading from URL (fetch, confirm, tag, save)
│   ├── syncToGithub.ts          # Push & pull sync commands with progress UI
│   └── contextMenu.ts           # Cut/Copy/Rename/Delete/Download for readings and notes
├── providers/
│   ├── readingsTreeProvider.ts  # Sidebar tree: year-month → reading → details
│   └── notesTreeProvider.ts     # Sidebar tree: year-month → note → tags
├── webview/
│   └── DashboardPanel.ts        # Webview: card layout, search, rich-text comment editor
└── test/
    ├── jsonDb.test.ts           # 19 tests: CRUD, concurrency, robustness
    ├── noteDb.test.ts           # 19 tests: CRUD, front matter, migration
    ├── metadataFetcher.test.ts  # 21 tests: OG, JSON-LD, keywords
    ├── gitSync.test.ts          # 38 tests: diff, migration, notes sync
    ├── mock/vscode.ts           # VS Code API mock for unit tests
    └── integration/
        └── extension.test.ts    # Manual integration test checklist
```

### Codebase Size
- **Production**: ~3,400 lines TypeScript (15 source files)
- **Tests**: ~1,200 lines (97 automated tests + manual integration checklist)

## Build & Development Commands
```bash
npm run compile      # Compile TypeScript → out/
npm run watch        # Watch mode compilation
npm run lint         # Type-check without emit
npm test             # Compile + run mocha tests
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
- **Concurrency**: `withMutationLock()` queue in both JsonDb and NoteDb to serialize writes
- **File safety**: Atomic writes via temp file + rename in JsonDb; YAML front matter in NoteDb

## Design Decisions
1. **JSON over SQLite** — git-friendly diffs, human-readable, sufficient for personal use (<5K records)
2. **Manual sync over auto-sync** — user triggers push/pull explicitly from sidebar buttons, no surprise syncs
3. **Git CLI over GitHub API** — simpler implementation, leverages existing user git auth (SSH/credential helper)
4. **cheerio over puppeteer** — lightweight (~50KB vs ~300MB), sufficient for `<meta>` tag extraction
5. **globalStorageUri** — VS Code managed path, safe across OS, survives extension updates
6. **Per-entry sync files** — each reading is an individual `{id}.json` file in the sync repo, enabling clean diffs and partial updates
7. **YAML front matter for notes** — standard Markdown convention, custom regex parser (no YAML library dependency)
8. **Title-based note filenames** — `{sanitized-title}.md` for human-readable editor tab titles; auto-migration from UUID filenames
9. **Context menus over inline icons** — right-click menus with grouped actions (Open, Clipboard, Edit, Manage) keep the UI clean

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
| `ynote.syncToGithub` | — | Push readings + notes to GitHub |
| `ynote.pullFromGithub` | — | Pull readings + notes from GitHub |
| `ynote.refreshReadings` | — | Refresh readings tree view |
| `ynote.editTags` | — | Edit tags on a reading |
| `ynote.createNote` | — | Create a new Markdown note |
| `ynote.openNote` | — | Open note in editor |
| `ynote.removeNote` | — | Remove a note |
| `ynote.editNoteTags` | — | Edit tags on a note |
| `ynote.refreshNotes` | — | Refresh notes tree view |
| `ynote.cutReading` | — | Cut reading (copy URL + delete) |
| `ynote.copyReading` | — | Copy reading URL to clipboard |
| `ynote.renameReading` | — | Rename reading title |
| `ynote.deleteReading` | — | Permanently delete reading |
| `ynote.downloadReading` | — | Download reading as Markdown |
| `ynote.cutNote` | — | Cut note (copy content + delete) |
| `ynote.copyNote` | — | Copy note content to clipboard |
| `ynote.renameNote` | — | Rename note (title + filename) |
| `ynote.deleteNote` | — | Permanently delete note |
| `ynote.downloadNote` | — | Download note as `.md` file |

## Testing
```bash
npm test             # Run 97 unit tests (mocha)
```
- **JsonDb tests** (`jsonDb.test.ts`): CRUD, concurrent writes, robustness (corrupted JSON, bad timestamps)
- **NoteDb tests** (`noteDb.test.ts`): CRUD, front matter parsing, UUID migration, concurrent writes
- **MetadataFetcher tests** (`metadataFetcher.test.ts`): OG/meta/JSON-LD extraction, keyword extraction
- **GitSync tests** (`gitSync.test.ts`): Diff computation, migration, notes sync, individual file I/O
- **Integration** (`extension.test.ts`): Manual checklist for Extension Host (9 scenarios)
- Tests mock `vscode` module for unit testing outside Extension Host

## Skills Reference
See `.github/skills/vs-code-extension/SKILL.md` for detailed workflows on compiling, packaging, installing, testing, and debugging. The skill includes reference docs for TypeScript standards, vscode mock patterns, and release checklists.
