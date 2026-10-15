# Returning to a duel — 2026-10-15

The lobby now remembers the player's next-duel setup and shows enough information to recognize the saved match. Match history supports finding a particular matchup and moving directly between its entry and replay.

## Changes

- **Remembered setup.** Both decks, each deck's battlefield selection, difficulty, starting player and match format survive reload. Existing players without preferences start from their saved matchup when those decks still exist. Deleted decks, invalid enum values and non-battlefield cards fall back safely. A storage failure keeps the current choices usable and displays a short notice.
- **A useful resume control.** The lobby shows the actual saved matchup, score, turn and current status. The opening hand is described by its status instead of “Turn 0.” On phones, the returning-player introduction is shorter and Resume appears before choosing a new deck, within the first screen at the tested sizes. Changing the next setup does not change this summary or the saved duel.
- **Find a replay.** Search both deck names, combine the query with victories or defeats, and sort by date or fewest turns. Search ignores case and combining accents, and reads only archive metadata. Counts and an empty-result message explain the current filters. Deck statistics still describe the full local archive.
- **Move between the match list and replay.** Choosing an entry scrolls to and focuses the replay. Back to saved matches returns focus to the selected entry, or to search when that entry is filtered out. An open replay remains available when filters change, with a notice when it is outside the results.
- **Reopen the guide.** Every unfinished local AI duel offers the guide, including after tips were turned off. Reopening preserves topics already seen. Generic contextual help no longer marks the scoring lesson as completed. Guide blocking applies only to the matching enabled duel.

New interface copy is available in EN/SR/IT. Preferences use a separate versioned browser-storage key; saved game and replay formats remain compatible.

## Verification

- Required suite: **78 files, 987 tests passed**. Saved-session selection: **14 passed**. Eight setup/search regressions are included in CI. The final malformed-difficulty case also passes the focused rerun.
- Catalog: **1,459 playable entries**, **13/13 retail precons**. Regression-report guards: **15 passed**.
- TypeScript and production client/server build passed. The existing shared-engine bundle warning remains.
- Browser checks: returning-player flows **9**, guided-duel/replay regressions **16**, lobby setup **6**, saved-session management **3**, mobile overlays **3**. Four further SR/IT checks cover resume visibility, search, result filters and focus navigation at 320px and 390px.
- Tests verify that changing setup, opening help, filtering and viewing history preserve the unfinished duel. Browser profiles and archives are isolated synthetic fixtures.
- Fresh production-preview profiles at 1366px and 390px verified persisted setup, manual guide recovery, visible resume information, archive import, result filters, replay seeking and unchanged unfinished-duel state.

Real-device Safari and the weekly exhaustive precon simulation were outside this interface release's validation.

## Reproduce

Run the test list in `.github/workflows/ci.yml`, `npm run cards:check`, `node scripts/check-regression-reports.mjs`, and `npm run build`. With Vite on port 5199, run `scripts/returning-player-check.mjs` with Playwright available. `PLAYWRIGHT_MODULE` can select an external install. The associated fixture is restricted to loopback origins.
