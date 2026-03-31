# YNote Development Progress

## Milestone 1: MVP — Core Reading Record (v0.1.0)
> Target: 2026-03-27

| Task | Status | Notes |
|------|--------|-------|
| Project scaffolding (package.json, tsconfig) | Done | VS Code Extension manifest with commands, views, settings |
| Harness files (CLAUDE.md, CHANGELOG.md, PROGRESS.md) | Done | Long-term AI development context |
| Reading data model | Done | `src/models/reading.ts` |
| JSON database CRUD | Done | `src/database/jsonDb.ts` — globalStorageUri |
| Metadata fetcher | Done | `src/services/metadataFetcher.ts` — axios + cheerio |
| VS Code commands | Done | Add, Remove, Open, Refresh, Sync, Dashboard |
| Sidebar tree view | Done | `src/providers/readingsTreeProvider.ts` |
| Webview dashboard | Done | Card layout with search/filter |
| GitHub sync | Done | `src/services/gitSync.ts` — git CLI |
| Extension entry point | Done | `src/extension.ts` |
| Compile & verify | Done | `npm run compile` passes |

## Milestone 2: Polish & Testing (v0.1.1)
> Target: 2026-03-30

| Task | Status | Notes |
|------|--------|-------|
| Unit tests for metadataFetcher | Done | 15 tests: OG tags, meta tags, JSON-LD, fallback, URL parsing |
| Unit tests for jsonDb | Done | 12 tests: CRUD, sort order, dedup, error cases |
| Integration test in Extension Host | Done | Manual checklist in `src/test/integration/extension.test.ts` |
| Cross-platform testing (Windows) | Skipped | Works in WSL; native Windows not needed |
| Error handling improvements | Done | Network errors, invalid URLs, timeout, "Save URL Only" fallback |
| Skill for extension development | Done | `.github/skills/vs-code-extension/` with references and scripts |
| CLAUDE.md framework diagram | Done | Data flow diagram + component table |
| README.md install instructions | Done | .vsix install (GUI + CLI), build from source, Remote SSH/WSL |

## Milestone 3: Enhanced Features (v0.2.0)
> Target: 2026-04

| Task | Status | Notes |
|------|--------|-------|
| Basic exception handling for URL fetch | Done | Network timeout/error shows clear user-friendly prompt with "Save URL Only" fallback |
| Left navigation bar year-month archiving | Done | Sidebar groups readings by YYYY-MM, click to expand/collapse |
| Right dashboard year-month archiving | Done | Dashboard groups cards by YYYY-MM, latest month expanded, others collapsed |
| Lightweight tag system | Done | Tag management via QuickPick UI with intelligent recommendations from existing tags and title keywords |

## Milestone 4: Future Enhancements (v0.3.0+)
> Target: TBD

| Task | Status | Notes |
|------|--------|-------|
| Search within readings | Not started | |
| Export to Markdown | Not started | |
| Read/unread status | Not started | |
| Per-reading notes | Not started | |
| Sync conflict resolution improvements | Not started | |

## Known Issues
- None yet (initial development)
