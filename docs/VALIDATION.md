# Validation evidence

Verified locally on **2 October 2026**. These results concern the four implemented practice decks and the recorded test scenarios. They do not establish support for every card in the imported catalogue or tournament certification.

## Latest completed command at this checkpoint

```sh
npx vitest run --reporter=verbose && npx tsc --noEmit
```

Result at 08:29:58 Europe/Sarajevo: **2 test files passed, 52 tests passed, exit code 0**. Vitest reported 2.81 seconds. TypeScript completed successfully with no diagnostics. This checkpoint comprised 25 rules regressions and 27 simulation/integration/card-effect tests. Additional suites may be added after this checkpoint; use `npm test` for current results.

## Complete-game simulation

`tests/simulation.test.ts` executes every ordered pairing of Annie, Lux, Garen, and Master Yi. Each pairing runs seeds `11`, `73`, and `20261002`, alternating the starting player by seed parity: **48 completed games**. A further two identical-seed Annie/Master Yi games verify deterministic replay, for **50 full games** in the suite.

All seeded games finished through legal actions before the 2,500-action limit. No crash, missing legal action, illegal bot decision, or repeated-state stall was observed. Every intermediate state checks:

- Forty non-token cards per player across deck, hand, discard, banished zone, units, gear, spell chain, and chosen-champion zone.
- Twelve runes per player across rune deck and channeled runes.
- Valid catalogue IDs and unique board-object IDs.
- Finite, nonnegative energy and nonnegative scores.
- Valid active player and priority holder.
- A terminal game phase and no legal actions after a winner is declared.

All four deck definitions also pass size, copy-limit, domain, champion-type, and Duel-ban validation. Every selected non-rune card has an explicit engine script. A script's presence is a coverage check, not proof of every possible interaction.

## Bot and state boundaries

The suite changes both hidden deck orders, both hidden rune-deck orders, and the opponent's hidden hand while preserving the acting player's information. Across a 120-action trace, the bot's chosen action remains identical. Public game views expose neither draw-pile order nor the opponent's hand. These tests support the bot's intended visible-information heuristic; they are not a security audit of a server-based multiplayer protocol.

Two same-seed complete games produce identical serialized final states and action counts. Saving and reloading the final state preserves it. A forged illegal action throws without mutating its input snapshot.

## Printed-effect regressions

Independent assertions verify:

- Challenge pays its Body power and an enemy target's universal Deflect surcharge separately.
- A triggered ability cannot choose an enemy Deflect target when its controller cannot pay the surcharge.
- First Mate readies the selected other unit, leaves itself exhausted, and does not ready an unselected enemy.
- Annie adds one damage to Incinerate; damage remains marked on a survivor until cleanup without reducing Might.
- Tibbers damages allied and enemy units across both battlefields while leaving both bases untouched.
- Firestorm damages only enemy units at the chosen battlefield.
- Recruit the Vanguard creates exactly four exhausted Recruit tokens, each placed individually at base or a controlled battlefield.

The separate `tests/rules-regression.test.ts` covers official setup, mulligan timing, first-player rune sequencing, entry/payment/movement, priority and reaction windows, scoring and the eighth point, combat assignment, Tank priority, simultaneous combat damage, and burnout. The official rule sources are recorded in `docs/RULES-RESEARCH.md`.

## Catalogue checks

The live Riftcodex import returned **1,451 printings in 8 provider sets**. The sync script checked the API total and unique provider IDs. The four deck definitions reference 63 distinct card IDs including six rune identities, four legends, and two battlefields. HEAD requests for all four chosen-champion images and both battlefield images returned `200 image/png`.

Provider provenance, dated ban-list status, remote artwork ownership, and distribution restrictions are documented in `docs/CARD-SOURCES.md`.

## Scope of this checkpoint

### Manual review component checkpoint

At 08:37:07 Europe/Sarajevo, `npx vitest run tests/step-flow.test.ts --reporter=verbose && npx tsc --noEmit` completed with **12 tests passed** and exit code 0. These additional tests verify Challenge's two target highlights, empty-field targeting, all members of a grouped move, dynamic combat Might highlights, comparison to the preceding frame, same-count hand replacement, resolving chain targets, removed units, safe invalid-index handling, exact JSON restoration of a pending frame, no automatic Proceed during component rendering, and AI mulligan labels that conceal card identities. Short change summaries expose counts and public board changes only.

The source audit identified and coordinated fixes for corrupted review indices, winning-frame resume availability, action filtering with duplicate hand cards, and mandatory movement/choice controls hidden by a prior selection. The component tests do not substitute for browser verification of button gating and keyboard behavior.

At 08:45:22 Europe/Sarajevo, `npx vitest run tests/persistence.test.ts --reporter=verbose && npx tsc --noEmit` completed with **9 tests passed** and exit code 0. The expanded persistence checks reject malformed actionable phase payloads, missing unit arrays, invalid numbers, corrupt runes, unknown card IDs, and unsafe review action fields. Valid final matches survive corrupted reviews. Display-only intermediate frames remain supported. For each of four decks, the test serializes and restores every real frame from a trace of up to 120 bot actions, verifying that the pending frame does not advance or disappear.

## Final local acceptance

At 08:48 Europe/Sarajevo, `npm run build && npm test` completed successfully: TypeScript and the Vite production build passed, followed by **79 tests in 5 files**. This includes the six engine tests in addition to the suites described above. The bundled catalogue produces a Vite chunk-size warning; it is not a build failure.

The production preview at `http://127.0.0.1:4173/` was exercised in the browser. A real Annie-versus-Lux game advanced through turn three, including mulligan, rune preparation, card play, AI play, and movement to Altar to Unity. Mandatory review frames hide action buttons. Both player effects and AI actions remain paused until Proceed. Golden highlights identify the changed card, source, destination, or resource. Reloading a pending review restored the exact frame without advancing it. No warning/error console entries were reported in the production tab.

At a 390-pixel viewport the document width was 390 pixels, with no horizontal page overflow. Desktop and mobile layouts were visually inspected. All 64 supported card images loaded from the local application origin with no failed images. The three generated playmats and all fonts are bundled locally.

Five screenshots from the running production build are saved in `docs/screenshots/`: lobby, a paused card effect with Proceed, battlefield movement highlights, card inspection, and the filtered card library. These are actual UI captures, not design mockups.

No GitHub push or Vercel deployment was performed: the user deferred remote publication until they can authenticate the desired GitHub account. The checks above cover the supported practice decks and observed flows, not every imported card or every possible interaction.
