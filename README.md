# YNote — Reading Record for VS Code

A private reading record system built as a VS Code extension. Paste a URL, auto-extract metadata (title, author, organization, abstract), and store it in a searchable, syncable database.

## Features

- **Add Reading**: Paste a URL (`Ctrl+Shift+Y`) — auto-extracts title, author, organization, and abstract
- **Sidebar Tree View**: Browse readings sorted newest-first, expand for details
- **Webview Dashboard**: Card-based view with search and filter
- **GitHub Sync**: Manually sync your readings to a private GitHub repo for cross-device access
- **Cross-Platform**: Works on Linux and Windows

## Getting Started

### Install from Source

```bash
git clone <your-repo-url>
cd ynote
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

### Install from VSIX

```bash
npx @vscode/vsce package
code --install-extension ynote-0.1.0.vsix
```

## Usage

1. Press `Ctrl+Shift+Y` or run **YNote: Add Reading from URL** from the command palette
2. Paste a URL (blog post, article, news)
3. The extension fetches metadata and saves the reading
4. Browse in the **YNote** sidebar or open the **Dashboard**

## GitHub Sync Setup

1. Create a private GitHub repository (e.g., `ynote-data`)
2. Open VS Code Settings → search "ynote"
3. Set `ynote.githubRepoUrl` to your repo URL (e.g., `git@github.com:yourusername/ynote-data.git`)
4. Run **YNote: Sync to GitHub** to push/pull readings

Requires git installed and authenticated (SSH key or credential helper).

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ynote.githubRepoUrl` | `""` | Private GitHub repo URL |
| `ynote.maxAbstractLength` | `500` | Max extracted abstract length |
| `ynote.fallbackDescriptionLength` | `100` | Fallback description length |
| `ynote.fetchTimeout` | `10000` | HTTP fetch timeout (ms) |

## Development

```bash
npm run compile   # Build
npm run watch     # Watch mode
npm run lint      # Type-check
```

## License

ISC
