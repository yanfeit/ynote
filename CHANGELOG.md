# Changelog

All notable changes to YNote will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
