#!/bin/bash
# Quick rebuild script for VS Code extension development
# Usage: bash .github/skills/vs-code-extension/scripts/rebuild.sh
set -e

echo "=== Compiling TypeScript ==="
npm run compile

echo "=== Running Tests ==="
npm test

echo "=== Packaging .vsix ==="
npx @vscode/vsce package

VSIX_FILE=$(ls -t ynote-*.vsix 2>/dev/null | head -1)
if [ -z "$VSIX_FILE" ]; then
  echo "ERROR: No .vsix file found"
  exit 1
fi

echo "=== Package created: $VSIX_FILE ==="
echo "Size: $(du -h "$VSIX_FILE" | cut -f1)"
echo ""
echo "To install: code --install-extension $VSIX_FILE --force"
echo "Then: Ctrl+Shift+P → Reload Window"
