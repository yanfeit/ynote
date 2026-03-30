// Integration test stub for running inside Extension Host.
//
// How to run:
//   1. Press F5 to launch the Extension Development Host
//   2. Open the Debug Console in the original VS Code window
//   3. In the Extension Host window, run commands and check console output
//
// This file documents the manual integration test steps.
// Automated Extension Host tests require @vscode/test-electron
// which we can add in a future milestone.

// Manual Integration Test Checklist:
//
// 1. ADD READING
//    - Ctrl+Shift+Y → paste a valid URL (e.g., https://www.anthropic.com/research/building-effective-agents)
//    - Verify: progress notification appears
//    - Verify: title confirmation input appears with extracted title
//    - Verify: "Saved" notification appears
//    - Verify: reading appears in sidebar tree view
//
// 2. ADD READING — Invalid URL
//    - Ctrl+Shift+Y → type "not-a-url"
//    - Verify: validation error "Please enter a valid URL"
//
// 3. ADD READING — Duplicate URL
//    - Ctrl+Shift+Y → paste same URL as step 1
//    - Verify: warning "This URL is already saved"
//
// 4. ADD READING — Network error
//    - Ctrl+Shift+Y → paste https://nonexistent-domain-ynote-test.com/page
//    - Verify: error message with "Could not resolve hostname"
//    - Verify: "Save URL Only" button is offered
//
// 5. TREE VIEW
//    - Click YNote sidebar icon → readings list visible
//    - Expand a reading → see Author, Org, Abstract, Source, URL
//
// 6. OPEN IN BROWSER
//    - Right-click a reading → Open in Browser
//    - Verify: browser opens with the URL
//
// 7. REMOVE READING
//    - Right-click a reading → Remove
//    - Verify: confirmation dialog appears
//    - Confirm → reading disappears from tree view
//
// 8. DASHBOARD
//    - Ctrl+Shift+P → "YNote: Show Dashboard"
//    - Verify: webview panel opens with cards
//    - Type in search bar → cards filter in real time
//
// 9. SYNC TO GITHUB
//    - Without ynote.githubRepoUrl configured:
//      - Ctrl+Shift+P → "YNote: Sync to GitHub"
//      - Verify: warning "GitHub repo URL not configured" + "Open Settings" button
//    - With repo configured:
//      - Verify: sync progress notification → success message

export {};
