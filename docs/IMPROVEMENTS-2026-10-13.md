# Riftbound improvement round — 2026-10-13

This round improves getting into a duel, understanding movement payments, keyboard interaction, startup payload, and offline recovery. Game rules, deck contents, and saved-session format are unchanged.

## Changes

1. **Shorter mobile setup.** Compact layouts show four deck cards with a localized expand/collapse control. The selected deck remains visible even when chosen from the end of the dropdown. Filters reset the disclosure. Small phones retain two columns; desktop retains the full gallery. At 390px, the initial gallery is 464px tall instead of seven rows.
2. **Movement cost at confirmation.** A taxed group move now shows the existing engine payment receipt on its confirmation button, including remaining runes. Selecting/removing units updates the preview without spending resources. Manual rune selection still uses the existing payment picker.
3. **Cleaner short-phone reactions.** When the reaction layout collapses the hand gallery, its inactive scrolling arrows and range also disappear. Browse hand remains available.
4. **Keyboard-safe mobile menu.** The menu uses shared dialog focus handling. Escape closes the menu and restores focus without clearing the selected card. Escape on the board still clears selection.
5. **Smaller startup bundle.** Card-art provenance remains in the audit manifest; the game imports a generated path-only index. A parity test guards all 285 paths and totals. The production main bundle changes from 2,309,958 to 2,188,441 bytes; gzip from 523,677 to 486,183 bytes (7.2% less).
6. **Offline setup after visible content.** Service-worker registration waits for load and an idle callback, with a timed fallback for browsers without the idle API. Atomic precaching remains complete. Installed navigation falls back to the cached app on HTTP 5xx as well as network failures; redirects, authentication/4xx responses and API requests retain their behavior.
7. **Respect reduced motion earlier.** Reduced-motion preferences render static event icons before the lazy animation players mount. This avoids their immediate loading and execution; the complete offline cache still includes animation chunks for later use.

## Verification

- Required CI selection: **76 files, 966 tests passed**. Added art-index, registration, reduced-motion, clarity and translation checks to CI.
- Saved-session regressions: **14 passed**, with seven unrelated long-running tests excluded by the existing CI name filter.
- Catalog: **1,459 playable entries**, **13/13 retail precons** covered. Regression-report guards: **15 passed**.
- TypeScript and full production/client/server build passed. The existing large-chunk warning remains; this round reduces payload without restructuring the shared game engine.
- **50 browser cases passed**, with no reported runtime errors: lobby (6), movement payment (5), mobile overlays (3), match clarity (18), interaction flows (18). Viewports span 320px portrait to 1440px desktop, including short landscape. Lobby controls checked in EN/SR/IT.
- Reduced-motion champion, combat and victory fixtures retained static feedback without requesting animation players during rendering.
- Fresh production-preview smoke: registration after load/idle; **83/83 app assets cached**; selected decks **38 images cached, zero unavailable**. Offline reload returned the cached shell and resumed the same saved opening hand and seed.

## Flow review

1. **Choose a deck — improved.** The compact gallery reduces scrolling and retains selected-state clarity. Every deck remains reachable through the full list or dropdown.
2. **Confirm a group move — improved.** The action shows its actual payable cost and post-payment runes. The target and selected count remain visible.
3. **React on a small screen — improved.** Hidden gallery navigation no longer competes with actionable controls. Source selection remains separate from committing a response.
4. **Open/close duel settings — fixed.** Tab stays in the dialog and Escape returns to the same card selection.
5. **Reload without a connection — passed.** The installed application resumes the local duel once required assets have been cached.

Screenshots are review evidence, not proof of complete accessibility conformance. Keyboard behavior, resource receipts, state retention and offline recovery were also exercised through assertions. Real-device Safari and the exhaustive weekly precon simulation matrix were not run for this presentation/startup round.

## Reproduce

```sh
npm run cards:check
node scripts/check-regression-reports.mjs
npm run build
# Run the test-file list in .github/workflows/ci.yml.
npm run dev -- --port 5199
```

With Playwright available, run `scripts/lobby-setup-check.mjs`, `scripts/movement-payment-check.mjs`, `scripts/mobile-overlays-check.mjs`, `scripts/match-clarity-check.mjs`, and `scripts/interaction-audit-check.mjs`. Set `PLAYWRIGHT_MODULE` when using an external Playwright install. These scripts use fresh local browser contexts and synthetic sessions; they do not touch production saves.
