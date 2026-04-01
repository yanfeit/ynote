# YNote Development Progress

## v0.1.0 — Initial Release
> Completed: 2026-04-01

### Core Infrastructure
| Task | Status | Notes |
|------|--------|-------|
| Project scaffolding (package.json, tsconfig) | Done | VS Code Extension manifest with commands, views, settings |
| Harness files (CLAUDE.md, CHANGELOG.md, PROGRESS.md) | Done | Long-term AI development context |
| Reading data model | Done | `src/models/reading.ts` — id, url, title, author, org, abstract, dates, tags, source, comment (HTML) |
| JSON database CRUD | Done | `src/database/jsonDb.ts` — globalStorageUri, sorted newest-first, dedup by URL |
| Metadata fetcher | Done | `src/services/metadataFetcher.ts` — axios + cheerio (OG, JSON-LD, meta tags, byline, paragraph fallback) |
| Extension entry point | Done | `src/extension.ts` — registers all commands, tree view, wires dependencies |

### User Interface
| Task | Status | Notes |
|------|--------|-------|
| Sidebar tree view | Done | Year-month grouping, expandable reading details (author, org, abstract, source, tags, URL) |
| Webview dashboard | Done | Card layout with year-month sections, real-time search/filter, inline comment editor |
| Rich text comment editor | Done | Click card to expand editor with toolbar (Bold, Italic, Strikethrough, Lists); comments stored as HTML |
| Tag system | Done | QuickPick for existing/suggested tags + custom input; content-based keyword extraction from article body |
| Error handling | Done | Specific messages for timeout/DNS/connection errors; "Save URL Only" fallback |

### GitHub Sync
| Task | Status | Notes |
|------|--------|-------|
| Git sync service | Done | `src/services/gitSync.ts` — clone, pull, merge, commit, push via git CLI |
| Push command | Done | `ynote.syncToGithub` — merge local+remote readings, push to GitHub |
| Pull command | Done | `ynote.pullFromGithub` — pull remote readings, merge into local |
| Dashboard sync buttons | Done | Push/Pull buttons in Dashboard header (top-right corner) |

### Testing & Documentation
| Task | Status | Notes |
|------|--------|-------|
| Unit tests for jsonDb | Done | 19 tests: CRUD, sort order, dedup, findById, comment CRUD, error cases |
| Unit tests for metadataFetcher | Done | 21 tests: OG tags, meta tags, JSON-LD, fallback, URL parsing, content keyword extraction |
| Integration test checklist | Done | Manual checklist in `src/test/integration/extension.test.ts` |
| Skill for extension development | Done | `.github/skills/vs-code-extension/` with references and scripts |
| README.md | Done | Install instructions (.vsix, build from source, Remote SSH/WSL) |

## Known Issues
- None
