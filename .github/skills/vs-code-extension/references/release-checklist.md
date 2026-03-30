# Release Checklist

Follow this checklist for each version release.

## Pre-release

- [ ] All changes are committed
- [ ] `npm run compile` — 0 errors
- [ ] `npm test` — all tests passing
- [ ] Version in `package.json` follows [Semantic Versioning](https://semver.org/):
  - **MAJOR** (`x.0.0`): Breaking changes to commands, settings, or data format
  - **MINOR** (`0.x.0`): New user-facing features (commands, views, settings)
  - **PATCH** (`0.0.x`): Bug fixes, error handling, docs, tests, internal improvements
- [ ] `CHANGELOG.md` has new entry
- [ ] `PROGRESS.md` milestones updated

## Package & Verify

```bash
npx @vscode/vsce package
```

- [ ] `.vsix` file created (check file size — should be >2MB with node_modules)
- [ ] Install and test in Extension Development Host: `code --install-extension ynote-*.vsix --force`
- [ ] Reload Window and verify commands work

## Commit & Tag

```bash
git add -A
git commit -m "v0.x.y: concise description"
git tag v0.x.y
git push origin main --tags
```

## Post-release

- [ ] Delete old `.vsix` files
- [ ] Upload `.vsix` to GitHub Releases if applicable
