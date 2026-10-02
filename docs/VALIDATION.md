# Validation evidence

## Publication preparation — 2 October 2026

The current working tree passes **1,031 tests in 35 files**, `npm run cards:check`, `npm run build`, and `git diff --check`. The registry contains 1,456 entries: 937 executable and 519 unsupported. Vite's existing bundle-size warning is non-blocking.

A fresh production preview at `http://127.0.0.1:4178/` loads the lobby and starts an Annie versus Lux duel. Keeping the opening hand reaches the paused manual review at step 1/2. The browser reported no captured console errors or warnings during this smoke test. Earlier publication statements below describe their original local-only checkpoints.

## Third card implementation wave — 2 October 2026

Acceptance: **961 tests in 31 files pass**, including 169 precon pairings and 16 mixed-expansion games. TypeScript and production bundling pass. The coverage report registers 1,456 entries: 1,451 unchanged provider printings plus five local rules tokens. **937 entries are executable; 519 remain unsupported**. This wave completes 130 previously unsupported printings and adds Tentacle.

The three new `*-wave3` modules and their focused suites cover 81 rules faces. Shared regressions exercise upfront trigger costs, target and mode persistence, colored Repeat costs, independent repeated modes, spell-only resources, explicit target events versus self-references, dynamic protection, live source locations, delayed draw triggers, and optional death triggers before winning conquest. Costs and choices are checked before responses and after reload. Independent code review found no further definite defects within this change.

`npm run cards:check` and `git diff --check` pass. The existing non-blocking Vite bundle-size warning remains. This wave was verified through engine tests and the production build; no new browser walkthrough is claimed. The earlier checkpoints below retain their historical counts.

## Full provider import and expanded card engine — 2 October 2026

Final card-import acceptance: **749 tests in 27 files**, `npm run cards:check`, `npm run build`, and `git diff --check` pass. This includes the existing 169-pair precon matrix and eight mixed-expansion games with card/rune conservation, read-only queries, legal progress and save restoration. The production build retains the non-blocking bundle-size warning.

The live refresh imported every **1,451 printing** returned by Riftcodex across eight sets while preserving all existing IDs. Four local rules tokens bring the registry to **1,455 entries**. **806 entries have executable support; 649 remain unsupported**. Import completeness is relative to the provider, whose latest record update is 21 July 2026; this is not a claim that all Riot cards/previews are present or that every imported card is playable.

New verification covers strict paginated import and catalog hashes; every-printing registration; safe alternate-art/promotional identity; copy limits including Spiderling's exception; rejection of unsupported engine initialization; complete-text compilation and rejection of unknown clauses; and explicit Origins, Spiritforged, Unleashed and Vendetta expansion scripts. Engine regressions cover source snapshots on death, declaration and revalidation of targets, selecting exact runes before responses, additional/recycle costs, persistent legend exhaustion, awakening before holding, finalized-play ordinals with resolved-play trigger timing, counters and Flow, spell modes, Empower events, simultaneous Might reductions and global returns, combat-only triggers, repeated delayed triggers and public reveal information. New choices and pending awakening survive save/load. Incomplete scripts discovered by the rules audit remain unsupported. See [CARD-COVERAGE.md](CARD-COVERAGE.md) and the reproducible [per-card inventory](card-coverage.json).

## Card inspection and animated combat — 2 October 2026

Acceptance at **10:25 Sarajevo time**: `npm test` passed **278 tests in 16 files**; `npm run build` passed TypeScript and production bundling; `git diff --check` was clean. The existing non-blocking catalog bundle-size warning remains.

The new combat suites prove that choosing a different legal damage target changes which unit survives. They verify exact simultaneous hit amounts, existing wounds, prevented damage, stunned/paired contributions, deaths, recall, and deferred control while death triggers resolve. Stepped and ordinary engine actions produce identical final states. Presentation tests reject future-result disclosure, distinguish moves/removals from confirmed defeats, and ensure rendering never invokes actions. Persistence tests round-trip the exact impact/result frames, preserve legacy frames, and retain valid matches when optional combat metadata is malformed.

Browser verification used `tests/combat-preview.html` on a separate loopback origin, `127.0.0.1:5175`, to leave the user's saved duel intact. Clicked real legal target assignments, advanced each AI decision with Proceed, inspected the simultaneous-hit frame, played through to the result, returned to earlier frames, and restored impact step **2/6** after navigation/reload. Playback stopped at the final frame with action execution still locked pending confirmation. A 390px viewport had no horizontal overflow; the focused card tooltip stayed fully within the viewport and displayed actual Might and damage. The production build at `127.0.0.1:4174` restored the existing Shen duel at its saved **1/2** frame, displayed an enlarged hand card, and produced no browser errors or warnings. Opponent hand/facedown surfaces had no preview triggers.

Recorded screenshots: [combat impact](screenshots/combat-impact.png) and [card inspection](screenshots/card-hover.png). The fixture page is development-only and is not included in the production entry point.

Updated **2 October 2026** for the 13 released starter/preconstructed decks, four earlier practice decks, local deck import/export, and explicit precon scripts. This document describes the checked scope; it does not claim that every catalog card or every possible interaction is supported, nor that the app is an official tournament referee.

## Final acceptance commands

```sh
npm test
npm run build
```

Final acceptance at **10:01 Sarajevo time, 2 October 2026**: **261 tests in 14 files passed**, including the complete 169-pair precon matrix. `npm run build` passed TypeScript and production bundling; `git diff --check` was clean. Vite reports a non-blocking catalog chunk-size warning (about 1.56 MB before gzip). The older totals recorded below are historical checkpoints.

## Deck data and import

`tests/deck-import.test.ts` and `tests/precon-integration.test.ts` cover text import/export, card-name and ID resolution, copy and size limits, domains, chosen champions, signature restrictions, runes, battlefield pools, banned cards, unsupported-card reporting, and local imported-deck persistence.

The released library contains 13 complete lists:

- Proving Grounds: Annie, Lux, Garen, Master Yi.
- Origins: Jinx, Viktor, Lee Sin.
- Spiritforged: Fiora, Rumble.
- Unleashed: Vi, Vex.
- Vendetta Showdown: Shen, Zed.

Each list preserves 40 main-deck cards including its chosen champion, 12 runes, and its supplied legend and battlefields. Each source list is exported to text and parsed again, comparing its main-deck entries and support report. Seeded setup selects a battlefield from each player's supplied pool. Proving Grounds has one supplied battlefield per deck; the later products have three.

Riot's published decklists support Origins and later products. **Proving Grounds contents use the complete RiftMana community transcription**, corroborated by Riot's product sheet; they are not represented as a complete Riot-hosted transcription. The reconciliation details, exact links, and future-release cutoff are in [PRECON-SOURCES.md](PRECON-SOURCES.md). Radiance, scheduled for 23 October, is excluded from the 2 October snapshot. Partial Pre-Rift pools are excluded.

Historical retail contents can include cards banned by the current constructed list. The importer separates structural validity, current legality, and engine coverage. Unsupported imported lists can be stored and inspected, but a match cannot start while either selected deck lacks scripts. A script-presence check does not prove all interaction semantics.

## Full-game simulation and invariants

`tests/precon-effects.test.ts` contains a complete matrix of **169 ordered pairings** of the 13 retail decks, including mirrors, with seeds `7200 + playerDeckIndex * 31 + opponentDeckIndex`. This matrix completed successfully during development. It selects only legal actions, requires a winner within 3,000 actions, and checks card/rune conservation and nonnegative resources after every action. The final acceptance rerun checks the completed code again.

`tests/precon-integration.test.ts` additionally plays each retail deck against the next deck in the list. These games verify deterministic `applyAction`/`applyActionStepped` equivalence, valid legal actions, no repeated-state stalls, state validation, and saved-choice restoration. Their accounting includes the separate zone for spells whose resolution is waiting for an explicit choice.

The earlier `tests/simulation.test.ts` still covers the four practice decks: all 16 ordered pairings at three seeds, plus two identical-seed deterministic replays. Its invariants include:

- Forty non-token cards per player across all owned card zones, including the chosen champion, hidden cards, spells on the chain, and spells resolving through a choice.
- Twelve runes per player across the rune deck and the board.
- Valid catalog IDs, unique board-object IDs, and finite nonnegative resources and scores.
- Valid turn and priority players; terminal phases without further legal actions after victory.
- Illegal-action rejection without input-state mutation.

These simulations are broad integration checks. A heuristic bot does not explore every legal branch, so focused effect tests are also required.

## Focused effect and timing checks

`tests/precon-effects.test.ts` exercises the original seven retail decks through real engine actions. It covers chosen-card discard damage, discard-trigger replay, trash retrieval, recycle costs, optional additional costs, sacrifice costs, per-player sacrifice choices, Hidden timing and token placement, Temporary death before hold scoring, bounce restrictions, explicit movement destinations, move triggers, optional battlefield effects, legend beginning effects, alternate victory, buffs and dynamic auras, per-mode activation limits, inherited abilities, multi-target spells, spell-only resources, and death replacement.

Specific edge regressions include the resolving spell staying outside trash until its choices finish, target protection changing before resolution, keeping non-targeted instructions when another instruction cannot execute, minimum-Might reductions, clearing resource pools at the main-phase boundary, and Disintegrate drawing only after an actual kill. The reinforcement regression preserves an existing showdown and its chain when an Ambush unit enters; earlier attackers must not gain new attack triggers merely because another unit joined.

Expansion suites exercise Spiritforged equipment and Mighty effects, Unleashed XP/Hunt and movement restrictions, and Vendetta Empower/Flow and protection effects. Tests distinguish printed equipment bonuses from incomplete provider text. The import, expansion, integration, rules, persistence, and Proceed suites should be run together after any shared engine change.

The original `tests/rules-regression.test.ts` covers setup, mulligans, first-turn rune sequencing, entry/payment/movement, priority and reaction windows, scoring and the eighth point, Tank and damage assignment, simultaneous combat damage, and burnout. Rule references are in [RULES-RESEARCH.md](RULES-RESEARCH.md).

## Manual Proceed, saves, and information boundaries

The engine returns immutable event frames. Both human actions and bot actions must pass through the manual Proceed gate; a bot decision is never driven by a timer. The final rules state and the displayed frame index are stored separately so that a reload can restore the same pending review.

`tests/step-flow.test.ts` and `tests/persistence.test.ts` check target highlights, grouped movement, removed units, resource changes, safe review indices, JSON restoration, malformed-save rejection, and preserving a valid match when its display-only review is corrupt. Real frame traces cover both old practice and retail precon games. Imported deck text and saves remain in the browser's localStorage.

Public game views hide draw-pile order, the opponent's hand, and the opponent's facedown-card identity. Bot boundary tests vary hidden orders and the opponent's hand while retaining the acting player's information. These are checks of a local heuristic and display boundary, not a claim of multiplayer protocol security.

## Local assets and browser verification

The checked manifest contains **285 cached card images**, totaling **28,047,582 bytes**, and `public/cards/` contains 285 files. The manifest records public source URLs and hashes. The cache script verifies the expected image content type and restricts source downloads to Riot's public card-art host. Playmats, fonts, and token fallback art are local. The uncached general catalog can still request remote artwork; that does not upload matches or imported deck text.

The production preview at `http://127.0.0.1:4174` was checked in the browser. Verified the 13-deck library and product filters; Shen's complete list and source link; local import reporting 28/28 supported distinct cards; persistence under My Decks; and launching the imported Shen against Zed. Kept the opening hand, advanced the manual Proceed steps, and played Hand Hammer. Reloading and choosing Resume restored exactly step 1/2, with four cards in hand and the resource payment preserved. The same behavior was rechecked against the final production build after concurrent lobby styling changes. All seven visible card images loaded and the captured browser error log was empty.

The real browser text export created `~/Downloads/precon-shen.txt` (1,415 bytes); a filesystem read verified one legend, one chosen champion, 39 main-deck cards, 12 runes and three battlefields. Import/export round trips for every retail deck are additionally covered by tests. [Current precon match screenshot](screenshots/precon-match.jpg) records the restored Shen/Zed match. Hidden information boundaries, invalid imports and unsupported-deck start gating are covered by automated checks; the browser walkthrough is not a claim that every possible board state was manually exercised.

## Earlier recorded checkpoints

### Exhausted medallions — 2 October

Final visual selection: small square black-and-red acrylic token inspired by the reviewed Marvel Champions accessories, with diagonal EXHAUSTED text at the lower right. All 32 affected component checks passed, as did the production build. Desktop and 390px browser verification confirmed lower placement, Might clearance, loaded art, fitting labels, unchanged full grayscale, and no horizontal overflow. See [current artwork and screenshots](EXHAUSTED-SQUARE-TOKEN.md). The paragraphs below record the initial behavior implementation.

An original transparent imagegen hourglass medallion now marks every exhausted unit, Legend, rune, and equipment item, including live enlarged previews and combat cards. Rendering uses the visible frame's readiness, so the marker appears and disappears with game state; unavailable hand cards do not receive it. The token stays bright while only the underlying exhausted card art is dimmed. No rules-engine changes were required.

All 86 targeted tests passed across the two new exhaustion suites plus champion-zone, combat-panel, Legend setup, and language tests. The production build passed with its existing bundle-size warning. Desktop and 390px browser checks confirmed loaded local artwork, the proper marked/unmarked cards, the enlarged Legend preview, no horizontal overflow, and the preserved hand/rune/starting-pair layout. No browser warnings or errors were captured. See [artwork, prompt, and screenshots](EXHAUSTED-TOKEN.md).

### Legend and chosen champion visibility — 2 October

The Legend was previously visible only as the player-bar portrait, while the chosen champion appeared beside the player's hand. Both are now explicit public zones for each player, also shown as a starting pair during deck selection. This matches [Core Rules](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf) 103.1, 103.2, 108.3, 111 and 112: one Legend starts in the Legend Zone, and the chosen champion is public in its separate zone and must be played by paying its cost.

- `tests/legend-zones.test.ts`: 38 checks passed for all 17 bundled and round-tripped imported decks, mulligan preservation, exact starting card counts, invalid Legend imports, champion play, Viktor's activated effect, and Annie's automatic effect. No engine correction was needed.
- `tests/champion-zone.test.ts`: 14 checks passed for public information, current-frame rendering, legal-action prompts, review suppression, opponent ownership, exhaustion across turns, and the empty champion zone.
- The full suite passed 999 tests in 32 files before the 14 component checks were added. Final component and language checks passed 21 tests; the final production build passed with the existing bundle-size warning.
- In a separate browser test origin, selected Viktor, confirmed both players' starting pairs and four-card hands, completed mulligans, selected the Legend, activated its ability, advanced each Proceed step, and placed the Recruit. The Legend became exhausted while the champion remained available. No browser warnings or errors were captured.
- The new zones fit 390px and 900px widths without horizontal overflow. English and Serbian labels were checked in the browser. [Verified Legend and Champion screenshot](screenshots/legend-champion-zones.jpg).
- Follow-up layout adjustment: each Legend/Champion slot is now 136px wide, centered side by side at desktop and 390px. Both rune rows render below their respective hands; browser geometry confirms this order, with zero rune cards remaining in player bars and no horizontal page overflow. Full rules remain available through hover, inspection and the action panel. [Compact slots and runes below hand](screenshots/compact-zones-runes.jpg).
- Final placement: both players' compact Legend/Champion pair sits to the right of the hand, with runes below the hand in the left column. Browser checks at 1280px and 390px confirmed right-side placement, aligned top edges, and no horizontal page overflow. Small screens retain the same arrangement with smaller slots and a scrollable hand. [Right-side Legend and Champion pair](screenshots/hand-right-zones.jpg).

The original four-deck version was validated on 2 October before this expansion:

| Checkpoint                          | Recorded result                        |
| ----------------------------------- | -------------------------------------- |
| 08:29 local engine/rules checkpoint | 52 tests in 2 files; TypeScript passed |
| Manual review component checkpoint  | 12 tests passed                        |
| Expanded persistence checkpoint     | 9 tests passed                         |
| 08:48 production acceptance         | 79 tests in 5 files; build passed      |

That older production preview was manually played through turn three, checked for mandatory Proceed gating and reload restoration, and inspected at desktop and 390-pixel width. Its 64 then-supported card images loaded locally. The five screenshots under `docs/screenshots/` document that earlier practice-deck UI, not automatically the current precon-import UI.

No GitHub push or Vercel deployment is claimed. The project remains a local development artifact. Publication provenance and policy context remain documented in [CARD-SOURCES.md](CARD-SOURCES.md) and the README.
