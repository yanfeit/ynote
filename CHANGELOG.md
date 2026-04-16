# Changelog

All notable changes to YNote will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2026-04-16

### Added
- **Image insertion in notes**: Full lifecycle image support for Markdown notes
  - `ynote.insertImage` (`Ctrl+Shift+I`): Open file picker to insert a local image into the active note
  - **Clipboard paste**: Paste screenshots/images directly into notes via `DocumentPasteEditProvider` (auto-saves as `paste-{timestamp}.png`)
  - **Drag-and-drop**: Drag image files from the file explorer into a note via `DocumentDropEditProvider`
  - Images stored in per-note subdirectories: `globalStorageUri/images/{noteId}/{timestamp-name}.ext`
  - Automatic Markdown image link insertion (`![alt](../images/{noteId}/{filename})`)
  - Supported formats: PNG, JPG, JPEG, GIF, WebP, SVG, BMP
- **Image sync**: Push/pull images alongside notes and readings to GitHub (`images/{noteId}/` directory in sync repo)
  - Binary file comparison (size + content) for efficient sync
  - Per-note subdirectory sync with automatic cleanup of removed notes
- **Auto-cleanup on note delete**: Deleting a note (via Remove, Delete, or Cut) automatically removes its associated images directory
- **Configuration**: `ynote.maxImageSizeMB` setting (default: 10) for image size warnings

### Changed
- Sync commands now include image counts in progress messages
- `gitSync.sync()` and `gitSync.pull()` accept optional `localImagesDir` parameter
- **esbuild bundling**: Extension now bundled with esbuild into a single `dist/extension.js` file, reducing VSIX size and improving load performance (no more `node_modules/` in package)
- Updated `.vscodeignore` to exclude `node_modules/`, `out/`, and `esbuild.js`

### Internal
- New `src/services/imageService.ts` — image save, delete, list, path generation, validation
- New `src/commands/insertImage.ts` — insert image command handler
- New `src/providers/imagePasteProvider.ts` — `ImagePasteProvider` + `ImageDropProvider`
- New `src/test/imageService.test.ts` — 20 image service tests
- Extended `src/test/gitSync.test.ts` — 11 new image sync tests
- Added `esbuild.js` build configuration

## [0.2.2] - 2026-04-16

### Added
- **Manage section** in sidebar: New "Manage" view with Settings, Push to GitHub, and Pull from GitHub action items
- **Double-click to open**: Reading items open URL in browser; Note items open Markdown file in editor
- **Settings command** (`ynote.openSettings`): Opens VS Code settings filtered to YNote configuration
- **Auto-expand current month**: The current month's YYYY-MM group in both "My Reading Diary" and "Notes" sidebar trees is expanded by default; other months remain collapsed
- **Click reading → Dashboard**: Clicking a reading item in the sidebar opens the Dashboard webview and scrolls to center on the selected entry (with brief highlight animation); "Open in Browser" remains available via right-click context menu

### Changed
- **Sync buttons consolidated**: Push/Pull buttons removed from "My Reading Diary" and "Notes" title bars, now in dedicated "Manage" section
- **NoteItem collapsible state**: Notes without tags show as flat items (no expand arrow); notes with tags remain expandable
- **Reading sidebar click behavior**: Single-click now opens Dashboard (previously opened URL in browser); browser open moved to context menu only

### Performance
- **Lazy-load axios and cheerio**: Heavy dependencies only loaded when adding a reading from URL, not on extension activation — significantly faster sidebar load
- **One-time migration**: UUID-to-title filename migration only runs once per session instead of on every `getAll()` call
- **Parallel file reads**: Note files parsed concurrently via `Promise.all()` instead of sequentially

## [0.2.1] - 2026-04-16

### Added
- **Right-click context menu** for readings and notes with Cut, Copy, Rename, Permanent Delete, and Download actions
  - Reading: Copy copies URL to clipboard; Download exports as Markdown
  - Note: Copy copies full Markdown content; Download saves `.md` file to chosen location
  - Cut copies content/URL then deletes with confirmation dialog
  - Rename updates title via input box (notes also rename the underlying file)
- **Sync buttons in sidebar title bars**: Push (⬆) and Pull (⬇) icons added to both "My Reading Diary" and "Notes" view headers

### Changed
- **Notes sidebar**: Removed Created and Updated detail fields from expanded note items (metadata still stored in front matter)
- **Note filenames**: Notes now stored as `{sanitized-title}.md` instead of `{uuid}.md` for human-readable editor tab titles
  - Existing UUID-named files are automatically migrated on load
  - Title collisions handled with `(2)`, `(3)` suffixes
  - Renaming a note also renames the underlying file
- **Dashboard**: Removed Push/Pull buttons (sync now accessible from sidebar title bars)
- **Context menu reorganization**: Reading/Note inline action icons replaced with organized right-click menu groups (Open, Clipboard, Edit, Manage)

### Internal
- New `src/commands/contextMenu.ts` module for all context menu handlers
- `NoteDb` refactored: `findFileById()` scans by front matter ID, `getIdFromFile()` for file watcher, `sanitizeTitle()` for filename generation, `migrateUuidFilenames()` for backward compatibility

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
