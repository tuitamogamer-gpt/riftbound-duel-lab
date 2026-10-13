# Guided duel, adaptive table and match debrief — 2026-10-13

Players can start a real duel with contextual guidance, give the current decision more table space, and revisit key outcomes after a completed match.

## Player experience

- **Play with a guide.** The lobby starts a single duel with the selected decks and battlefields. The human starts against Beginner AI. Six contextual lessons explain the opening hand, rune payment, movement, reactions, damage assignment and scoring. The match waits while a lesson is open. A suggested card selects its source; the player still confirms the actual action and payment. Topics already seen and the disabled setting survive reload for that duel. The toolbar reopens contextual help.
- **Space for the current decision.** The hand gets more room while choosing a card. Targeting, group movement and damage assignment expand the board, with a labelled Browse hand control preserving access to cards. Hidden cards keep their gallery while choosing Hide or Play, including when hiding is blocked. Short landscape layouts retain their existing arrangement. Presentation does not commit actions or spend resources.
- **Learn from a completed match.** Review key moments opens the newly archived match directly. The recap counts observed hold, conquest and other scoring, then selects up to five varied decision checkpoints: scoring, units leaving play, responses, resource commitments and the finish. Each row includes the public action and measured before/after values. Clicking it seeks to the decision's outcome and focuses the replay board. Switching perspective updates the recap.
- **Translations and access.** New interface text is available in EN/SR/IT. Guide dialogs use the shared focus trap and Escape behavior. Compact guide actions remain reachable while the content scrolls; replay analysis uses the available desktop width.

## Information and storage boundaries

Guide suggestions use the human's legal sources and current public state. The recap consumes the existing observed replay frames for the selected perspective. It reports outcomes and general review prompts, without inferring an optimal move from future draws or private opponent cards. A partially captured replay reports only points gained in its captured frames.

Guide progress has a separate versioned local-storage record tied to the duel seed; malformed or unavailable storage falls back safely. The completed-match shortcut appears after the existing archive write succeeds. Existing archive failure feedback and replay export remain available when storage fails.

## Verification

- Required core selection: **77 files, 979 tests passed**. Saved-session selection: **14 passed**. The guide, table and debrief add 13 focused regressions and are included in CI.
- Catalog validation: **1,459 playable entries**, **13/13 retail precons**. Regression-report guards: **15 passed**.
- TypeScript and production client/server build passed. The existing shared-engine chunk warning remains.
- **63 browser cases passed**: new experience (16), match clarity (18), existing interaction flows (18), taxed movement payment (5), mobile overlays (3), and Hidden payment/mode flows (3). Desktop, short desktop, portrait and landscape viewports span 320–1440px. Assertions cover state preservation, real confirmations, dialog access, action visibility and replay navigation.
- **Four additional SR/IT phone checks** cover guidance, readable hand access, recap and replay seeking at 320px and 390px.
- Fresh production-preview checks at 1366px and 390px completed both real mulligans, reached the first human turn, and preserved the duel seed and revision through reload and resume.

Browser checks use isolated Chromium contexts. Real-device Safari and the long-running weekly precon simulation matrix were outside this presentation release's validation.

## Reproduce

Run the required test selection in `.github/workflows/ci.yml`, `npm run cards:check`, `node scripts/check-regression-reports.mjs`, and `npm run build`.

Start the local Vite server on port 5199, then run `scripts/duel-experience-check.mjs` with Playwright available. `PLAYWRIGHT_MODULE` can point to an external install. Its loopback-only fixture creates isolated test sessions and completed replays. Existing regression scripts are `match-clarity-check.mjs`, `interaction-audit-check.mjs`, `movement-payment-check.mjs`, `mobile-overlays-check.mjs`, and `hidden-payment-check.mjs`.
