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

## Milestone 4: Rich Text Comments & Tag Improvements (v0.3.3)
> Target: 2026-03-31

| Task | Status | Notes |
|------|--------|-------|
| Remove read/unread status | Done | `isRead` field removed — adding a link implies it has been read by design |
| Remove comment from sidebar | Done | Comment no longer shown in tree view details |
| Rich text comment editor in dashboard | Done | Click card to expand editor with Bold, Italic, Strikethrough, Lists |
| Comment saved as HTML | Done | Rich text stored in `comment` field, rendered inline in dashboard |
| Save via button | Done | Toolbar Save button sends comment to extension backend |
| Remove `toggleReadStatus` command | Done | Command and menu entry removed from package.json |
| Remove `editComment` sidebar command | Done | Replaced by dashboard inline editor |
| Content-based tag extraction | Done | Tags suggested from full article body text + meta keywords using word frequency analysis |
| Tag flow: recommended + custom combined | Done | QuickPick for recommended tags, then input box for custom tags; both merged with dedup |
| Sidebar editTags re-fetches content | Done | Re-fetches URL to provide content-based tag suggestions instead of title-word splitting |
| List buttons merged into dropdown | Done | Bullet and numbered list buttons merged into single dropdown menu |
| Comment displayed on card | Done | Comment preview visible on card face; click to edit; placeholder for empty comments |
| Fix duplicate org/source display | Done | Source badge hidden when identical to organization in both dashboard and sidebar |
| Update unit tests | Done | 40 tests passing (19 jsonDb + 21 metadataFetcher including 6 keyword extraction tests) |
| Search within readings | Deferred | Basic search already functional in dashboard |
| Export to Markdown | Deferred | Not prioritized for current release |
| Sync conflict resolution | Deferred | Current merge-by-updatedAt strategy is sufficient; no conflicts observed |

## Milestone 5: Future Enhancements (v0.4.0+)
> Target: TBD

| Task | Status | Notes |
|------|--------|-------|
| Multi-line comment editor | Not started | Use webview or multi-line input for longer comments |
| Comment history / versioning | Not started | Track comment edits over time |
| Reading statistics dashboard | Not started | Charts showing read/unread ratio, readings per month, tag distribution |
| Bulk operations | Not started | Mark multiple readings as read, bulk tagging |
| Import from browser bookmarks | Not started | Import readings from Chrome/Firefox bookmark exports |
| Keyboard shortcuts for status | Not started | Quick toggle read/unread without context menu |

## Known Issues
- None yet (initial development)
