# Authenticated End-to-End Test Notes

## Session
Authenticated managed preview session verified as Mahboob Skylightmedia. Routes rendered through the authenticated dashboard shell.

## Verified workflows

| Area | Test | Result |
|---|---|---|
| Overview | Dashboard shell, navigation, connected projects, activity feed | Pass |
| Projects | Existing projects visible; Link or path and Upload reference controls; Delete and Re-inspect controls | Pass |
| Tasks | Created `Authenticated workflow smoke test` for EUA; Pending → In Progress; detail opened with assignment | Pass |
| Security audit | Ran audit for EUA; Complete status and NOT VERIFIED source-scan boundary displayed | Pass |
| Testing | Requested Full test suite for EUA; Not Verified status and no-runner output displayed | Pass |
| Reports | Generated Inspection Report for EUA; Markdown and PDF actions visible | Pass |
| Code changes | Empty review queue correctly explains how proposals enter it | Pass |
| Assistant | Sent protected-folder question; long Markdown response rendered and composer remained available | Pass |
| Builder | Generated safe folder-protection proposal; structured result exposed Reset, Export, Approve, Reject, command feedback field | Pass |
| Builder Reset | Cleared prompt and latest proposal state without execution | Pass |
| Automation | Saved a safe smoke-test script and pressed Run; Run #1 recorded Pending lifecycle with NOT VERIFIED no-runner output | Pass |

## Responsive/console findings

Assistant mobile screenshot kept the composer visible. Projects mobile screenshot fit the form. Automation initially showed horizontal clipping at 390px; width constraints were added to the grid/card/form and a follow-up mobile screenshot showed the card constrained to the viewport. Fresh authenticated browser console inspection after the full workflow sequence returned no console output or controlled-input warning.

## Safety boundary observed

No file writes, shell execution, deployment, password cracking, credential bypass, or unauthorized access was performed. The platform correctly records proposals and runner requests separately from executed work.

## Remaining verification

Need run final typecheck/tests after the Automation mobile fix, inspect dev logs, update todo status, save a checkpoint, and produce the feature-by-feature usage/report document.

## Final regression update

The first 390px Automation screenshot showed the new-script card extending beyond the visible right edge. The Automation grid, card, and form controls were then constrained with full-width/min-width/overflow classes. A follow-up 390px screenshot showed the card contained within the viewport; the long script text itself remains naturally scrollable within the code field.

After the full authenticated interaction pass, current 10:00–10:08 browser logs contained no current HTTP 4xx/5xx network failures, no current dev-server errors, and the browser console showed only normal Vite/React initialization entries. Historical log entries from earlier archive migration work are not part of the current test window.

Final automated checks at 10:08:15: 3 Vitest files passed, 14 tests passed. TypeScript check passed after the mobile fix.
