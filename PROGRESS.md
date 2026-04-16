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

---

## v0.1.1 — Security Hardening
> Completed: 2026-04-15

### Security Fixes
| Task | Status | Notes |
|------|--------|-------|
| Fix XSS in dashboard URL handler | Done | Replaced inline JS string literal with `data-url` attribute + `dataset` access |
| Race condition prevention | Done | Added `withMutationLock()` queue to JsonDb for serializing concurrent writes |
| Atomic file writes | Done | JsonDb writes to temp file + rename, preventing corruption on crash |
| Input validation | Done | `normalizeReading()` validates/sanitizes all fields when reading from disk |
| Comment HTML sanitization | Done | Server-side cheerio allowlist + client-side re-sanitization before save |
| GitSync ID validation | Done | `isSafeReadingId()` regex prevents path traversal in sync files |
| Tree view error handling | Done | Catches DB read errors, displays error item instead of crashing |

### Testing
| Task | Status | Notes |
|------|--------|-------|
| Concurrent write tests | Done | JsonDb mutation lock serialization |
| Corrupted JSON recovery | Done | Graceful handling of malformed readings.json |
| Invalid timestamp normalization | Done | Fallback to epoch for unparseable dates |
| Unsafe ID rejection | Done | Path traversal prevention in gitSync |
| Incremental diff computation | Done | computeDiff() for push/pull optimization |
| 22 new tests added | Done | 62 total (19 jsonDb + 21 fetcher + 22 new) |

---

## v0.2.0 — Notes Module
> Completed: 2026-04-16

### Notes Infrastructure
| Task | Status | Notes |
|------|--------|-------|
| Note data model | Done | `src/models/note.ts` — id, title, createdAt, updatedAt, tags, filePath |
| NoteDb CRUD | Done | `src/database/noteDb.ts` — Markdown files with YAML front matter parser |
| Create note command | Done | `ynote.createNote` — title input, tag selection, opens in VS Code native editor |
| Open note command | Done | `ynote.openNote` — opens Markdown file in text editor |
| Remove note command | Done | `ynote.removeNote` — confirmation dialog, deletes file |
| Edit note tags | Done | `ynote.editNoteTags` — unified tag pool (readings + notes) via QuickPick |
| Auto-update timestamp | Done | File watcher updates `updatedAt` front matter on save |

### Notes Sidebar
| Task | Status | Notes |
|------|--------|-------|
| Notes tree view | Done | Year-month grouping by createdAt, expandable details (tags, dates) |
| Notes tree provider | Done | `src/providers/notesTreeProvider.ts` — NoteYearMonthGroup → NoteItem → NoteDetail |
| Sidebar renamed | Done | Readings section renamed to "My Reading Diary" |

### Notes Sync
| Task | Status | Notes |
|------|--------|-------|
| syncNotes() | Done | Copies local `.md` files to sync repo `notes/` directory |
| pullNotes() | Done | Copies remote `.md` files to local, deletes unmatched local files |
| Note counts in progress | Done | Sync messages include note counts alongside reading counts |

### Testing
| Task | Status | Notes |
|------|--------|-------|
| NoteDb CRUD tests | Done | 19 tests: add, remove, update, find, getAllTags |
| Front matter parsing | Done | Robustness: missing fields, invalid timestamps, no front matter |
| Concurrent write tests | Done | NoteDb mutation lock serialization |
| syncNotes tests | Done | Copy, overwrite, delete, missing dir handling |
| pullNotes tests | Done | Copy, delete, missing dir, create dir |
| 35 new tests added | Done | 97 total |

---

## v0.2.1 — UX Polish & Context Menus
> Completed: 2026-04-16

### Context Menu System
| Task | Status | Notes |
|------|--------|-------|
| Context menu module | Done | `src/commands/contextMenu.ts` — 10 handlers for both readings and notes |
| Cut (reading) | Done | Copies URL to clipboard, then deletes with confirmation dialog |
| Copy (reading) | Done | Copies reading URL to clipboard |
| Rename (reading) | Done | Input box for new title, updates JsonDb |
| Permanent delete (reading) | Done | Confirmation dialog → removes from JsonDb |
| Download (reading) | Done | Save dialog → exports as Markdown file (title, author, URL, abstract, tags) |
| Cut (note) | Done | Copies full markdown content to clipboard, then deletes with confirmation |
| Copy (note) | Done | Reads `.md` file, copies content to clipboard |
| Rename (note) | Done | Input box → updates front matter + renames underlying file |
| Permanent delete (note) | Done | Confirmation dialog → deletes note file |
| Download (note) | Done | Save dialog → copies `.md` file to chosen location |

### Menu Organization
| Task | Status | Notes |
|------|--------|-------|
| Right-click menu groups | Done | Open → Clipboard → Edit → Manage (separators between groups) |
| Remove inline action icons | Done | Old inline icons (open/remove/editTags) replaced by right-click menu |
| 23 total commands registered | Done | 9 reading + 10 note + 2 sync + 2 UI commands |

### Sync Buttons Relocated
| Task | Status | Notes |
|------|--------|-------|
| Sync buttons in Readings title bar | Done | Push (⬆) and Pull (⬇) as navigation icons |
| Sync buttons in Notes title bar | Done | Push (⬆) and Pull (⬇) as navigation icons |
| Remove Dashboard sync buttons | Done | Buttons removed from Dashboard HTML + JS handlers |

### Human-Readable Note Filenames
| Task | Status | Notes |
|------|--------|-------|
| `sanitizeTitle()` helper | Done | Strips `/ \ : * ? " < > |`, collapses dashes, truncates to 100 chars |
| Title-based filenames | Done | Notes stored as `{sanitized-title}.md` instead of `{uuid}.md` |
| Collision handling | Done | Appends `(2)`, `(3)` etc. for duplicate titles |
| `findFileById()` | Done | Scans all `.md` files for matching front matter ID |
| `getIdFromFile()` | Done | Extracts note ID from front matter (for file watcher) |
| UUID filename migration | Done | `migrateUuidFilenames()` auto-renames UUID-named files on load |
| File rename on title change | Done | `updateMetadata()` renames file when title is updated |

### Notes Sidebar Cleanup
| Task | Status | Notes |
|------|--------|-------|
| Remove Created/Updated display | Done | Removed from NoteDetail children (metadata preserved in front matter) |
| Tags-only detail view | Done | Only Tags shown when expanded (if present) |

### Testing & Documentation
| Task | Status | Notes |
|------|--------|-------|
| Updated noteDb tests | Done | Tests use `note.filePath` instead of `getNotePath(note.id)` |
| Robustness tests updated | Done | Corrupt file and missing field tests rewritten for new storage |
| 97 tests passing | Done | All existing tests updated for title-based filenames |
| CLAUDE.md updated | Done | Full architecture rewrite reflecting v0.2.1 codebase |
| CHANGELOG.md updated | Done | v0.2.1 entry with all changes documented |
| PROGRESS.md updated | Done | Full history: v0.1.0 → v0.1.1 → v0.2.0 → v0.2.1 |

## Known Issues
- None
