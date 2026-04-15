# Changelog

All notable changes to YNote will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-16

### Added
- **Notes module**: Full lifecycle note-taking with Markdown files and YAML front matter
  - `ynote.createNote`: Create a new note with title and optional tags, opens in VS Code native editor
  - `ynote.openNote`: Open an existing note in the text editor
  - `ynote.removeNote`: Delete a note (with confirmation dialog)
  - `ynote.editNoteTags`: Edit tags on a note via QuickPick (unified tag pool with readings)
  - `ynote.refreshNotes`: Refresh the notes tree view
- **Notes sidebar**: New "Notes" view in the YNote sidebar with year-month grouping, expandable details (tags, dates)
- **Notes sync**: Push/pull notes (`.md` files) alongside readings to the same GitHub repo (`notes/` directory)
- **Auto-update timestamp**: Saving a note file automatically updates its `updatedAt` front matter field

### Changed
- Renamed sidebar "Readings" section to "My Reading Diary"
- Sync commands now include note counts in progress messages

### Data Model
- `Note` interface: `id`, `title`, `createdAt`, `updatedAt`, `tags`, `filePath`
- `NoteDb` class: CRUD operations on markdown files with YAML front matter parsing
- Notes stored as `<uuid>.md` files in `globalStorageUri/notes/`

### Testing
- Added 35 new tests (97 total): NoteDb CRUD, front matter parsing robustness, concurrent writes, syncNotes, pullNotes

## [0.1.1] - 2026-04-15

### Security
- **Fix XSS in dashboard URL onclick handler**: Replaced inline JS string literal with `data-url` attribute + `dataset` access to prevent URL-based script injection (URLs containing single quotes could break out of the JS string context in the previous escapeAttr approach)

### Hardening (from prior code review)
- **Race condition prevention**: Added mutation queue (`withMutationLock`) to JsonDb for serializing concurrent writes
- **Atomic file writes**: JsonDb now writes to a temp file and renames, preventing corruption on crash
- **Input validation**: `normalizeReading()` validates and sanitizes all fields when reading from disk; invalid timestamps fallback to epoch
- **Comment sanitization**: Server-side HTML sanitization via cheerio (allowlist: b/strong/i/em/s/strike/ul/ol/li/p/br/div/span/code) plus client-side re-sanitization before save
- **GitSync ID validation**: `isSafeReadingId()` regex prevents path traversal in individual sync files
- **Tree view error handling**: Catches DB read errors and displays an error item instead of crashing
- **Dependency security**: Upgraded axios to ^1.15.0 (patched known CVEs)

### Testing
- Added 22 new tests (62 total): concurrent writes, corrupted JSON recovery, malformed entry skipping, invalid timestamp normalization, unsafe ID rejection, incremental diff computation, migration, individual file I/O

## [0.1.0] - 2026-04-01

Initial release of YNote — a VS Code extension for maintaining a private reading record system.

### Core Features
- **Add Reading from URL** (`Ctrl+Shift+Y`): Paste a URL, auto-extract metadata (title, author, organization, abstract) via axios + cheerio (Open Graph, JSON-LD, meta tags, byline selectors, paragraph fallback)
- **JSON database**: Readings stored in `readings.json` under VS Code `globalStorageUri`, sorted newest-first, deduplicated by URL
- **Sidebar tree view**: Readings grouped by year-month with expandable details (author, org, abstract, source, tags, URL)
- **Dashboard webview**: Card-based layout grouped by year-month with real-time search/filter across title, author, tags, abstract, and comments
- **Rich text comments**: Click any dashboard card to expand an inline editor with formatting toolbar (Bold, Italic, Strikethrough, Lists); comments stored as HTML
- **Tag system**: Intelligent tag recommendations from existing tags and content keyword extraction (full article body + meta keywords, word frequency analysis); combine QuickPick selection with custom comma-separated input
- **GitHub sync**: Push and pull readings to/from a private GitHub repo via git CLI; sync buttons in Dashboard header; merge strategy based on `updatedAt` timestamps

### Commands
- `ynote.addReading` — Add reading from URL
- `ynote.removeReading` — Remove selected reading
- `ynote.openReading` — Open URL in browser
- `ynote.showDashboard` — Open webview dashboard
- `ynote.syncToGithub` — Push readings to GitHub
- `ynote.pullFromGithub` — Pull readings from GitHub
- `ynote.refreshReadings` — Refresh tree view
- `ynote.editTags` — Edit tags on a reading (with content-based suggestions)

### Configuration
- `ynote.githubRepoUrl` — Private GitHub repo URL for sync
- `ynote.maxAbstractLength` — Max extracted abstract length (default: 500)
- `ynote.fallbackDescriptionLength` — Fallback description length (default: 100)
- `ynote.fetchTimeout` — HTTP fetch timeout in ms (default: 10000)

### Error Handling
- Specific messages for timeout, DNS resolution, connection refused, HTTP status errors
- "Save URL Only" fallback when metadata extraction fails

### Testing
- 40 unit tests (19 jsonDb + 21 metadataFetcher including content keyword extraction)
- Manual integration test checklist for Extension Host
