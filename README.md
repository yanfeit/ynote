# YNote — A Lightweight Note-Taking Plugin for Learners

## Why I Build YNote

Researchers track the progress of their peers through literature review, and literature management tools have emerged as a targeted solution to systematically address the needs of collecting, organizing, and retrieving academic literature. For modern developers — especially those working in the artificial intelligence (AI) field — they routinely obtain fragmented updates on cutting-edge industry trends, technical solutions, and open-source project information through multiple channels, including official announcements, WeChat Official Account articles, technical blogs, X (formerly Twitter), and GitHub repositories. Currently, commercial note-taking tools like Notion and Obsidian are commonly used to take notes. However, the free version of these tools typically are designed for general-purpose note-taking and too heavyweight. In the era of agent-coding, we can build a lightweight note-taking plugin easily with the help of large language models (LLMs) and open-source libraries. Therefore, I built YNote to provide me with a dedicated information management tool that is lightweight and tailored to my usage habits.

YNote is built as a VS Code extension. Just Paste a URL, auto-extract metadata (title, author, organization, abstract), and store it in a github private repo as a reading record. 

![](assets/ynote_design.png)

## Features

### Reading Management
- **Add Reading from URL** (`Ctrl+Shift+Y`): Paste a URL — auto-extracts title, author, organization, and abstract via Open Graph, JSON-LD, and meta tags
- **Sidebar Tree View**: Readings grouped by year-month (current month auto-expanded), with expandable details (author, org, abstract, source, tags, URL)
- **Webview Dashboard**: Card-based layout with real-time search/filter across title, author, tags, abstract, and comments; year-month sections with collapse/expand
- **Click to Dashboard**: Click a reading in the sidebar to open the Dashboard and scroll to that entry
- **Rich-text Comments**: Click any Dashboard card to expand an inline editor with formatting toolbar (Bold, Italic, Strikethrough, Lists)
- **Tag System**: Intelligent tag recommendations from existing tags and content keyword extraction; QuickPick selection with custom comma-separated input

### Note-Taking
- **Create Notes**: Create Markdown notes with YAML front matter — title, tags, optional `pinned: true`, and auto-timestamps
- **VS Code Native Editing**: Notes open in VS Code's built-in editor with full Markdown support
- **Notes Sidebar**: Dedicated pinned section plus year-month grouping (current month auto-expanded), with expandable tag details for regular notes
- **Auto-update Timestamp**: Saving a note file automatically updates its `updatedAt` front matter without removing `pinned` metadata

### Organization & Management
- **Context Menus**: Right-click any reading or note for Cut, Copy, Rename, Permanent Delete, and Download; notes also support Pin and Unpin
- **Manage Section**: Dedicated sidebar view with Settings, Push to GitHub, and Pull from GitHub actions
- **GitHub Sync**: Push and pull readings + notes to a private GitHub repo via git CLI; diff-based merge with `updatedAt` timestamps

### Cross-Platform
- Works on Linux (native and WSL), Remote SSH, and Windows

## Installation

### Option A: Install from .vsix (recommended)

1. Download the latest `ynote-x.x.x.vsix` from the [Releases](https://github.com/yanfeit/ynote/releases) page
2. In VS Code, open the **Extensions** sidebar (`Ctrl+Shift+X`)
3. Click the **`...`** menu at the top-right of the Extensions panel
4. Select **Install from VSIX...**
5. Choose the downloaded `.vsix` file
6. Click **Reload Window** when prompted

### Option B: Install from .vsix via command line

```bash
code --install-extension ynote-x.x.x.vsix
```
Then reload VS Code (`Ctrl+Shift+P` → **Reload Window**).

### Option C: Build from source

```bash
git clone https://github.com/yanfeit/ynote.git
cd ynote
npm install
npm run compile
npx @vscode/vsce package
code --install-extension ynote-*.vsix
```

### Remote SSH / WSL

YNote works in Remote SSH and WSL environments. When connected to a remote machine, install the `.vsix` using the same methods above — VS Code will place it in the remote extension host automatically.

## Usage

1. Press `Ctrl+Shift+Y` or run **YNote: Add Reading from URL** from the command palette
2. Paste a URL (blog post, article, news)
3. The extension fetches metadata and saves the reading
4. Browse in the **YNote** sidebar or open the **Dashboard** via command palette
5. Create notes via the **Notes** sidebar (`+` button) and edit in VS Code's native editor
6. Pin important notes from the note context menu to keep them in the **Pinned** section at the top of the sidebar
7. Sync everything to GitHub via the **Manage** section in the sidebar

### Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| YNote: Add Reading from URL | `Ctrl+Shift+Y` | Paste URL, extract metadata, save |
| YNote: Show Dashboard | — | Open webview dashboard with search |
| YNote: Open in Browser | — | Open reading URL in browser (context menu) |
| YNote: Create Note | — | Create a new Markdown note |
| YNote: Open Note | — | Open note in VS Code editor |
| YNote: Pin Note / Unpin Note | — | Toggle whether a note stays in the pinned section |
| YNote: Edit Tags | — | Edit tags on a reading |
| YNote: Edit Note Tags | — | Edit tags on a note |
| YNote: Push to GitHub | — | Push readings + notes to GitHub |
| YNote: Pull from GitHub | — | Pull readings + notes from GitHub |
| YNote: Refresh Readings | — | Refresh readings sidebar |
| YNote: Refresh Notes | — | Refresh notes sidebar |
| YNote: Settings | — | Open YNote configuration |
| YNote: Cut/Copy/Rename/Delete/Download | — | Context menu actions for readings and notes |

## GitHub Sync Setup

1. Create a private GitHub repository (e.g., `ynote-data`)
2. Open VS Code Settings → search "ynote"
3. Set `ynote.githubRepoUrl` to your repo URL (e.g., `git@github.com:yourusername/ynote-data.git`)
4. Run **YNote: Push to GitHub** from the Manage section to sync

Requires git installed and authenticated (SSH key or credential helper).

The sync repo structure:
```
ynote-data/
├── readings/
│   ├── {id1}.json
│   ├── {id2}.json
│   └── ...
└── notes/
    ├── {title1}.md
    ├── {title2}.md
    └── ...
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ynote.githubRepoUrl` | `""` | Private GitHub repo URL |
| `ynote.maxAbstractLength` | `500` | Max extracted abstract length |
| `ynote.fallbackDescriptionLength` | `100` | Fallback description length |
| `ynote.fetchTimeout` | `10000` | HTTP fetch timeout (ms) |

## Data Storage

Your data is stored locally in VS Code's global storage path:

**Readings**: `readings.json` (JSON database, sorted newest-first)
- **Linux / WSL**: `~/.config/Code/User/globalStorage/yanfeit.ynote/readings.json`
- **Remote SSH**: `~/.vscode-server/data/User/globalStorage/yanfeit.ynote/readings.json`
- **Windows**: `%APPDATA%\Code\User\globalStorage\yanfeit.ynote\readings.json`

**Notes**: Individual Markdown files with YAML front matter in `notes/` subdirectory (`pinned: true` is supported)
- **Linux / WSL**: `~/.config/Code/User/globalStorage/yanfeit.ynote/notes/{title}.md`
- **Remote SSH**: `~/.vscode-server/data/User/globalStorage/yanfeit.ynote/notes/{title}.md`
- **Windows**: `%APPDATA%\Code\User\globalStorage\yanfeit.ynote\notes\{title}.md`

## Development

```bash
npm run compile   # Build
npm run watch     # Watch mode
npm run lint      # Type-check
npm test          # Run unit tests
```

Press `F5` in VS Code to launch the Extension Development Host for live testing.

## License

ISC
