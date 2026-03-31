# Changelog

All notable changes to YNote will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] - 2026-03-31

### Changed
- Tag flow now always shows both recommended tags (QuickPick) and custom tag input, merging results with deduplication
- Sidebar "Edit Tags" command re-fetches URL content for content-based tag suggestions instead of title-word splitting
- Removed duplicate source badge from dashboard footer when source matches organization
- Removed duplicate source detail from sidebar tree view when it matches organization
- 40 unit tests passing

## [0.3.2] - 2026-03-31

### Changed
- Tag suggestions now extracted from full article content (body text + meta keywords) using word frequency analysis, instead of just title keywords
- Tag quick-pick now shows content-based suggestions even when no existing tags are saved
- Merged bullet list and numbered list toolbar buttons into a single "List" dropdown menu in the comment editor
- Comments are now displayed directly on each dashboard card (visible without clicking)
- Clicking a card opens the rich text editor pre-filled with the existing comment; comment preview hides while editing
- Save button updates the on-card comment preview immediately
- "Click to add a note..." placeholder shown on cards without comments
- 40 unit tests passing (added 6 content keyword extraction tests)

## [0.3.1] - 2026-03-31

### Removed
- Read/unread status (`isRead` field, `ynote.toggleReadStatus` command) — adding a link implies it has been read
- Comment display from sidebar tree view — comments now live exclusively in the dashboard
- `ynote.editComment` sidebar command — replaced by inline dashboard editor

### Changed
- Comment field now stores HTML (rich text) instead of plain text
- Dashboard comment editor: click any card to expand a rich text editor with toolbar (Bold, Italic, Strikethrough, Bullet list, Numbered list) and Save button
- Editor uses VS Code font family and size for visual consistency
- Only one comment panel open at a time; clicking another card closes the previous
- Comment indicator (💬) updates dynamically on save
- 34 unit tests passing (removed 4 isRead-related tests)

## [0.3.0] - 2026-03-31

### Added
- Read/unread status: toggle a reading as read or unread via sidebar context menu (`ynote.toggleReadStatus`)
- Per-reading comments: add, edit, or clear text comments on any reading (`ynote.editComment`)
- Sidebar tree view shows read status icon (checkmark for read, bookmark for unread) and comment indicator
- Dashboard displays read/unread badges on each card and renders comments in a styled block-quote
- Dashboard search now includes comment text in search results
- `findById()` method on `JsonDb` for direct ID lookups
- 11 new unit tests: `findById` (2), `isRead` status (3), comment CRUD (6) — total 38 tests passing

### Changed
- `Reading` model extended with `isRead` (boolean) and `comment` (string) fields
- New readings default to `isRead: false` and `comment: ''`
- Tree view `ReadingItem` shows status symbol (✓/○) and 💬 indicator in description
- Dashboard cards show `card-read` class with reduced opacity for read items

## [0.1.1] - 2026-03-30

### Changed
- Improved error handling: specific messages for timeout, DNS, connection refused, HTTP errors
- Added "Save URL Only" fallback when metadata extraction fails
- Moved skill to `.github/skills/vs-code-extension/` with proper YAML frontmatter, references, and scripts
- Fixed version numbering to follow Semantic Versioning (internal improvements are PATCH, not MINOR)

### Added
- Unit tests: 12 jsonDb tests, 15 metadataFetcher tests (mocha)
- Integration test checklist in `src/test/integration/extension.test.ts`
- CLAUDE.md framework data flow diagram and component responsibility table
- README.md with install instructions (.vsix, build from source, Remote SSH/WSL)

## [0.1.0] - 2026-03-27

### Added
- Initial project scaffolding as a VS Code Extension
- `Reading` data model with fields: id, url, title, author, organization, abstract, addedAt, tags, source
- JSON-based database stored in VS Code globalStorageUri
- Metadata extraction from URLs using axios + cheerio (title, author, org, abstract from meta tags, Open Graph, JSON-LD)
- Sidebar tree view showing readings sorted newest-first with expandable details
- Webview dashboard with card-based layout, search/filter, and date sorting
- GitHub sync via git CLI (manual trigger) — commit and push readings.json to a private repo
- Commands: Add Reading (`Ctrl+Shift+Y`), Remove Reading, Open in Browser, Show Dashboard, Sync to GitHub, Refresh
- VS Code configuration settings for repo URL, abstract length, fetch timeout
- Harness files: CLAUDE.md, CHANGELOG.md, PROGRESS.md for long-term AI-assisted development
