# Changelog

All notable changes to YNote will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
