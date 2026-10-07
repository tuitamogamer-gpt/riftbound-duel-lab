# Validation evidence

## Remaining 107 catalog entries — 7 October 2026

The refreshed coverage report contains **1,459 executable / zero unsupported / 1,459 registered** entries, including 1,451 provider printings and eight rules tokens. All 107 frozen previously unsupported IDs now have executable registration; three new local rules tokens account for the increase in total entries. See the [exact source ledger](IMPORT-107-SOURCES.md).

Completed targeted runs passed **199 tests in 12 files** across waves sixteen through twenty-six and the import checks. After the selected-reveal refinements, **81 tests in three files** passed. The latest completed run passed **143 tests in five files**, covering wave twenty-five, registry registration, all import checks, Vendetta edge cases and stepped/direct engine equivalence. These overlapping runs are separate checkpoints, not additive coverage totals.

The full suite was stopped at the user's explicit request to finish commit, push and deployment without additional tests. That incomplete run had reported obsolete registry expectations, the Hidden targeting regression, a timeout and wave-twenty-five failures during concurrent edits. The affected suites pass in the latest targeted runs; the entire suite and 169-matchup matrix are **not claimed green** for this final revision. No further tests or browser walkthroughs were run after that request. Production compilation is performed by the deployment build.

## Next 100 catalog entries — 7 October 2026

The final targeted run passed **815 tests in 24 files**, including the new **111 rules/printing cases**, **102 import checks**, and **two complete mixed-deck games**. It also covers waves five through twelve, persistence, triggered choices, movement, Hidden, bot observations, Spiritforged and ordinary rules regressions. The complete-games fixtures check legal progress, immutable queries, card/rune conservation (including pending plays), save/resume at choices and a terminal winner.

An earlier complete `npm test` checkpoint ran **2,086 tests in 68 files** in **1,109.36 seconds**. All **169 ordered precon matchups** passed. That checkpoint reported three failures: two caught the same premature group-destination confirmation, and one still expected a newly scripted Sett printing to be unsupported. The group rule was corrected and the obsolete assertion now verifies Sett's independent identity and reviewed script. Both affected suites pass in the final 815-test run. The complete matrix was not repeated after these narrow corrections and the final card-specific refinements; this is not a claim of a second fully green whole-suite run.

The final TypeScript/Vite production build, refreshed `cards:report`, `cards:check` and `git diff --check` pass. Existing Vite bundle-size and Node localStorage warnings remain. Coverage is **1,349 executable / 107 unsupported / 1,456 registered**, exactly **100 more executable catalog printings** than the previous checkpoint. The [source ledger](IMPORT-100-SOURCES.md) lists all 100 IDs, including alternate prints and provider variants; the gain does not mean 100 distinct designs.

Focused cases distinguish finalization from parent resolution, public targets from private choices, remaining Power/taxes from waived Energy, physical trash visits from matching card names, failed plays from successful plays, unit damage from spell damage, current source location from the original trigger location, and gone sources from live characteristics. They also cover optional costs, counters, extra turns, per-mode limits, existing attachments producing no new attach event, named tags, revealed-card events, leave-chain replacement and malformed saves. Hybrid Patched Porobot and Smite remain unsupported.

Browser QA used `tests/import-100-preview.html` on isolated **127.0.0.1:5293**, at **1280×720**. Jayce was played for four Energy (**6 → 2**), a friendly gear was selected and killed, and clicking Doran's Shield in hand then exposed both its ordinary cost and **0 Energy / 0 Power** option. The free option kept Energy at **2** and survived Reload/Resume; see [Jayce result](screenshots/import-100-jayce.png).

The `?scenario=revive` fixture paid The Harrowing's **6 Energy / 2 Power** (**10/2 → 4/0**), with the trash card declared before responses. After resolution, the pending Stalwart Poro offered base and controlled-battlefield locations at zero cost. Reload/Resume preserved that decision. Selecting base produced a new exhausted **2-Might** Poro and left The Harrowing in trash; see [resolved revival](screenshots/import-100-resolved.png). Browser warning/error logs were empty, displayed images loaded and there was no horizontal overflow. These are synthetic fixtures outside the production entry point.

## Twelfth card wave — 7 October 2026

The targeted run passed **377 tests in 14 files**, including **42 new wave-twelve cases**, waves six through eleven, persistence, translations, Hidden flow, deck import, precon timing, bot tactics and combat review. The complete suite and the 169-precon matchup matrix were not repeated in this continuation.

TypeScript/Vite production build, `npm run cards:check` and `git diff --check` pass. The existing Vite chunk-size warning remains. Coverage is **1,249 executable / 207 unsupported** out of 1,456 entries, a gain of **five faces / five printings**. The provider catalog and existing previous-wave work are preserved.

Tests cover optional versus required board costs, separate physical payment and effect identities, base-cost waivers with Deflect and Helm increases, restricted resources, timing, return/kill/token handling, attachment removal, lethal cleanup, post-resource Mighty eligibility, replaced deaths, deferred cost-trigger ordering, counters without refunds, stale actions, saved pending choices and equivalence of stepped/direct play. Read-only legality queries leave the original resource state unchanged. UI payment labels retain English card names in translated actions.

Browser QA used `tests/card-wave12-preview.html` on isolated **127.0.0.1:5292**, at **1280×720**. Call to Glory's normal controls offered an explicit buff payment at **0 Energy / 0 Power**. Playing it spent Stalwart Poro's buff before the response window, lowering displayed Might from **5 to 4**. Reload and Resume restored the unfinished presentation with the cost already paid. Resolution then raised Might to **7**, placed the spell in trash and left Energy at **0** and universal Power at **20**. See the [resolved spell](screenshots/card-wave12-resolved.png). No browser warnings or errors were captured. The fixture remains outside the production bundle.

## Eleventh card wave — 7 October 2026

The final targeted run passed **243 tests in seven files**, including **32 new wave-eleven tests** plus waves five and ten, Spiritforged, Spiritforged extra effects, Hidden flow and deck import. Before the final equivalent aura-lookup optimization, the combined six-file run also passed all **16 persistence tests**, including event-frame recovery across the four practice decks. These are targeted checks; the 169-precon matchup matrix and the complete suite were not repeated in this continuation.

TypeScript/Vite production build, `npm run cards:check` and `git diff --check` pass. The existing Vite chunk-size warning remains. Coverage is **1,244 executable / 212 unsupported** out of 1,456 registered entries, a gain of **six faces / six printings**. Provider data, existing unsupported boundaries and all previous-wave work are preserved.

Tests exercise reaction timing and upfront attachment selection, Hidden-only play triggers and battlefield target revalidation, saved Hidden selections, area damage without Deflect targeting, stacked inherited abilities, removal of gear versus removal or movement of the source, ability Bonus Damage, universal Equip costs, Unique deck limits, ready prohibitions, dynamic nearby Ganking, independent native/equipment Hunt and Blue Sentinel repetitions, XP before the response window, failed attachment without refund, saved paid abilities and Weaponmaster retaining XP costs.

Browser QA used the synthetic `tests/card-wave11-preview.html` on isolated **127.0.0.1:5291**. Playing Shepherd's Heirloom through the normal controls spent two Energy (**20 → 18**) and its triggered ability granted **one XP**. The Equip choices explicitly displayed **spend 1 XP**. Activating Equip consumed the XP before the opponent's response window and left universal Power at **20**. Reload and Resume preserved that paid ability; after resolution, Stalwart Poro's displayed Might increased from **4 to 6** and the gear row showed its attachment. See [resolved XP equipment](screenshots/card-wave11-resolved.png). No browser warnings or errors were captured. The fixture remains outside the production bundle.

## Tenth card wave — 7 October 2026

The complete `npm test` run passed **1,805 tests in 62 files**, including all **169 ordered precon pairings** (1,017.54 seconds). That run used the 39-case checkpoint of wave ten. Final review then added four regressions for Eye of the Herald's live source location and Hexdrinker's addition to intrinsic numeric Deflect, alongside their narrow fixes. The final targeted run passed **200 tests** across waves five, nine and ten and the ordinary precon effects (the 169 matchup cases were already covered by the complete run). This covers **1,809 distinct passing tests** across the two checkpoints; it does not represent a second complete run after those final fixes.

The new suite in `tests/card-wave10.test.ts` passes **43 tests**. Coverage is **1,238 executable / 218 unsupported** out of 1,456 registered entries, a gain of **19 printings from 13 Equipment faces**. TypeScript/Vite production build, `npm run cards:check` and `git diff --check` pass; the existing Vite chunk-size warning remains.

Tests cover correct attachment costs and domain restrictions, universal Spinning Axe Power, independent equipment triggers and their unit source, Deflect payment and addition to intrinsic numeric Deflect, live-location target revalidation, uncontested conquests, attachment removal and transfer, Tank assignment, stacked defensive Shield, Weaponmaster, Brutalizer timing, save/load and malformed timestamps, discard continuations, Gold and Recruit tokens, ordinary versus extra scoring, Blue Sentinel, Rockfall Path and attached/unattached Temporary lifetimes. Incomplete Equipment remains unsupported and alternate printings still require the full gameplay fingerprint.

Browser verification uses the synthetic `tests/card-wave10-preview.html` on isolated **127.0.0.1:5290**, in the native in-app browser viewport (644×1219). Cloth Armor was played through the actual controls, paying one Energy. Reload and Resume preserved the unfinished attachment choice. After selecting Stalwart Poro and passing the reaction window, the unit visibly gained **Shield 2**, and the Equipment row showed the attachment. Card details showed the missing **+0 Might / Shield 2** panel and linked the official card image; see [Equipment inspection](screenshots/card-wave10-equipment.png). Brutalizer was then equipped to the same unit through the normal ability/reaction flow: universal Power fell from **20 to 19**, Energy stayed **19**, and the unit's displayed Might increased from **4 to 7**. The Equipment row showed both attachments; see [resolved equipment](screenshots/card-wave10-resolved.png). No browser warnings or errors were captured. These fixtures are excluded from the production bundle.

## Ninth card wave — 6 October 2026

The integrated working tree passed **1,766 unique tests in 61 files**, including all **169 ordered precon pairings**, the existing mixed-expansion games and two new games with ninth-wave cards. The new focused suite contains **48 tests**. Six Vitest runs covered 1,543 tests outside `precon-effects.test.ts`, its 54 ordinary rules tests, and four matchup groups of 52, 39, 39 and 39 games. Merged JSON reports keyed by filename and full test name confirm that every case passed exactly once, with zero uncovered cases or failures. `npm run build`, `npm run cards:check` and `git diff --check` passed. The existing Vite chunk-size warning remains.

Coverage is **1,219 executable / 237 unsupported** out of 1,456 registered entries, a gain of 17 printings from 12 new card faces. Tests exercise per-spell bonus damage and unit-sourced damage, delayed kill identities and prevention, Legion, gear-only Power, normal and expansion gear abilities, first-activation discounts, Azir's Equipment gate and Weaponmaster, additive conquer/hold triggers, independent repeated trigger costs, delayed Main-phase resources, early-point replacement, Heron timing/expiry, named-spell restrictions and persisted choices, public named-spell status, Poro's turn-wide damage memory and malformed saves. Teemo's obsolete Hidden double trigger from wave eight is corrected and its regression now expects one defending trigger.

Browser verification used `tests/card-wave9-preview.html` at isolated **127.0.0.1:5319**, at 1280×720. Ornn's real Legend control immediately displayed **1 Power for gear** while universal Power stayed zero. Activating Poro Snax with Piltovan Forge under friendly control consumed that restricted Power, left Energy at **20**, sacrificed Snax and drew one card. This confirms both the restricted resource and the first-activation discount through the normal UI.

The `?scenario=names` fixture played Fallen Feline to the controlled battlefield and paid **2 Energy / 1 Power**. Searching **Noxian Guillotine** filtered the spell-name options to one. Reloading and resuming preserved the unfinished choice and resources at **18 / 4**. Selecting the spell returned normal action controls; card inspection displayed **Named spell: Noxian Guillotine** and its restriction. No browser warnings or errors were captured. See [spell search](screenshots/card-wave9-name-search.png) and [resolved named-spell status](screenshots/card-wave9-named-spell.png). These are synthetic local fixtures and are not part of the production build.

## Eighth card wave — 6 October 2026

Final validation passed **1,716 unique tests in 60 files**, including all **169 ordered precon pairings**, the existing mixed-expansion games and two new games with eighth-wave cards. The new focused suite has **46 tests**. The suite was partitioned into six Vitest runs: 1,493 tests outside `precon-effects.test.ts`, its 54 ordinary rules tests, and four matchup groups containing 52, 39, 39 and 39 games. JSON reports were merged by filename and full test name: every case passed exactly once, with no uncovered cases or failures. `npm run build`, `npm run cards:check` and `git diff --check` passed. The existing Vite chunk-size and Node localStorage warnings remain.

Coverage is **1,202 executable / 254 unsupported** out of 1,456 entries: **12 new card faces / 16 printings**. Tests cover group declarations and shared destinations before payment, Deflect affordability, zero targets, protection, reaction-driven subset choices, exact identities, save restoration and malformed saves, linear option growth on a 100-unit board, mixed unit/gear/rune selections, Hidden triggers, outside-hand discounts, live-source destinations and exact self-recycle/self-sacrifice costs. Bot choices finish group selections without loops. Its planner also avoids treating a sampled future draw as a known follow-up play from hand; all 51 bot acceptance/tactics tests pass.

Browser verification used `tests/card-wave8-preview.html` at isolated **127.0.0.1:5308**, at 1280×720. Through the real board controls, Fox-Fire selected two opposing units with total Might four. Reloading and resuming preserved both selections and the unpaid **20 Energy / 10 Power**. Confirmation killed both units, moved Fox-Fire to trash, spent three Energy and restored the normal action controls. Selection clicks update immediately. See [saved selection](screenshots/card-wave8-selection.png) and [resolved board](screenshots/card-wave8-resolved.png).

The same browser match then played Tricksy Tentacles: Shipyard Skulker and battlefield 1 were declared before confirmation. Resolution moved the unit out of its base to that battlefield, put the spell in trash and changed resources from **17 / 10 to 13 / 9**. The action controls returned and no browser warnings or errors were captured. See [resolved movement](screenshots/card-wave8-movement.png). These are synthetic local fixtures; the provider catalog and original printed text are unchanged.

## Seventh card wave — 6 October 2026

At **15:20 Sarajevo time**, the isolated `card-engine-import` working tree passed **1,444 tests in 55 files**, including all 169 ordered precon pairings and 16 mixed-expansion integration games. The seventh wave has **49 focused tests**. `npm run build`, `npm run cards:check` and `git diff --check` passed. The existing Vite catalog chunk-size warning and Node test-environment localStorage warning remain. The refreshed provider snapshot is unchanged at 1,451 records in eight sets, plus five local tokens. Executable coverage is **1,186 / 1,456**, a gain of **84 printings** from 28 new card faces and reviewed equivalent printings; **270 remain unsupported**.

Focused tests cover physical trash visits and identical copies, reactions removing targets, independent owners, declarations before costs, zero targets, linear selection from 100-card trashes, saved selection drafts and malformed saves. They also exercise discard batches, Hwei's separate reflexive effects, first-play/move conditions, restricted resource allocation and expiry, Kennen's Flow identity/timing/costs, three-stage Kayle empowerment, Teemo hiding, Jax's dynamic Quick-Draw and Equip, Warden readying restrictions, Hierophant damage protection, targeted ability counters and ability completion through a saved multi-token choice. Renekton's restricted Energy also pays for existing expansion unit abilities, with Nasus checking their actual Energy cost after resolution. Incomplete Equipment and incompatible-tag aliases remain rejected.

Browser verification used the synthetic `tests/card-wave7-preview.html` fixture on the isolated origin **127.0.0.1:5297**. Through the real controls, Shadows of the Past selected Teemo from the player's trash and Stalwart Poro from the opponent's trash. Reloading and resuming preserved both selections. Confirming returned each card to its owner's hand, put Shadows in its owner's trash and changed resources from **20 Energy / 10 Power to 17 / 9**. The next-action controls returned. See [selection](screenshots/card-wave7-selection.png) and [resolved board](screenshots/card-wave7-resolved.png).

The `?scenario=resources` fixture also activated Kai'Sa through the Legend control. Her exhausted state and **1 Power for spells** appeared while universal Power stayed zero. Rune Prison became playable using that pool, while the unit requiring Power remained unavailable. Playing Rune Prison consumed the restricted Power, spent two Energy, stunned the opposing unit and finished with an empty chain. No browser errors or error overlays were recorded. See [restricted resource display](screenshots/card-wave7-resources.png).

The work is isolated because another active task is refactoring the bot in `/Users/boro/Downloads/Igra`. This verification covers the card-import worktree, not an unverified merge with that concurrent refactor.

## Sixth card wave — 4 October 2026

At 14:14 Sarajevo time, the integrated working tree passed **1,387 tests in 53 files**, including all 169 ordered precon pairings and the existing mixed-expansion games. The new wave has **47 focused tests**. TypeScript/production bundling, `npm run cards:check` and `git diff --check` passed; the existing catalog chunk-size warning remains. Registry coverage is **1,102 executable / 354 unsupported** out of 1,456 entries, a gain of 39 printings from 29 card faces. The provider catalog and original text were not changed.

Tests cover every new face and shared interactions: card-versus-token restrictions, own-turn counting, one-rune Channel phases, dynamic ninth-point victory and final-conquest replacement, duplicate Deathknell on simultaneous deaths, upfront compound declarations, partial resolution, live-source movement, group subset choice/reload, buff-spend Gold triggers, Fury threat checks, Hidden/Flow/Ambush taxes, Repeat discounts, colored/universal payment allocation, Deflect reductions and limited Energy floors. Unknown effects remain excluded from playable decks.

Browser verification used the synthetic `tests/card-wave6-preview.html` fixture on an isolated origin (`127.0.0.1:5286`). The real UI resumed the fixture at **8/9** with Aspirant's Climb, offered Bellows target/Repeat choices with Marai's discount, and played Bellows through the normal controls. After resolution the target showed one damage, the card was in trash, resources had changed from 20 Energy / 10 Power to 19 / 9, and the next-action controls were available again. No console warnings or errors were captured. [Screenshot](screenshots/card-wave6.jpg).

## Fifth card wave and website deck codes — 4 October 2026

The integrated working tree passed **1,331 tests in 51 files**, including the 169 ordered precon pairings. After the final test-fixture typing and translation corrections, the 75 focused card-wave, deck-source and translation tests passed again. `npm run build`, `npm run cards:check`, and `git diff --check` passed. The existing Vite catalog chunk-size warning remains. The refreshed catalog has **1,456 registered entries (1,451 provider printings plus five tokens), 1,063 executable and 393 unsupported**. The fifth wave adds 25 explicit faces and 34 executable printings.

The new 55-case rules suite covers every newly registered face plus behavior for double target/Deflect selection, immunity and partial resolution, Hidden target restrictions, raw Might swaps, unit-sourced damage, damage prevention and multipliers, battlefield permissions, moving Kayn, Weaponmaster declaration and removed-target revalidation, Leona/Jax triggers, Janna's optional enemy, Reckoner's Arena, Sigil and Faefolk. Pending target and rune choices and temporary statuses are restored through serialization.

The 13 deck-code tests exercise real upstream codec packets for all four practice decks, missing-champion resolution, signed and R/SP card numbers, whitespace, v5 quantity counts, sideboard preservation/export/reload and limits, malformed/truncated/oversized packets, additional-legend rejection and URL guidance. Existing text-import and storage tests still pass.

Browser checks at `http://127.0.0.1:5175/` pasted a generated Piltover code into the actual import dialog, named and saved **Annie · Piltover import**, and verified the imported option in both player selectors after a clean reload. The preview showed 40 cards, 12 runes and all 16 unique rules faces supported. At 390×844, the dialog and save control remained accessible without horizontal overflow. A clean reload after source edits produced no new console errors or warnings; Vite had reported a transient circular-module hot-reload failure during the simultaneous engine edits before that reload. The existing saved duel was not overwritten. See the [import screenshot](screenshots/deck-code-import.png).

## Fourth card wave and visible precon selection — 2 October 2026

Acceptance at **20:32 Sarajevo time**: **1,245 tests in 46 files passed**, including all 169 ordered precon pairings and the mixed-expansion games. TypeScript and production bundling passed. The registry contains 1,456 entries: **1,029 executable and 427 unsupported**. This wave adds 94 previously unsupported printings and withdraws two incomplete hybrid Patched Porobot records, a net gain of 92. The three wave4 suites cover 63 Origins/Spiritforged, 49 Unleashed and 52 Vendetta scenarios; existing suites also test the new shared engine behavior.

New behavior checks include typed Power and showdown Energy, optional XP payments, compound target revalidation, live source restrictions, raw negative-Might arithmetic, copied gear abilities, source departure after a trigger, and saved pending choices. Deathgrip, Guards!, Tideturner, Tianna and Rengar follow the official errata documented in [rules research](RULES-RESEARCH.md). Registry tests prohibit incomplete hybrid cards from becoming executable through aliases or compilation.

The production preview at `http://127.0.0.1:5271/` was tested on a separate origin to preserve the user's existing saved duel. All 13 official precons appeared on first load. With the Origins gallery filter selected, choosing Vex from **Your deck** reset the gallery to all precons; **Opponent's deck** independently selected Zed. Starting this matchup and keeping the opening hand reached turn 1 with Vex and Zed's correct Legends and chosen champions. The new **Decks** button returned to the picker. Card inspection displayed Deathgrip's current-rule notice and official source link beside the unchanged provider text. No browser console warnings or errors were captured. [Precon picker screenshot](screenshots/precon-picker.jpg).

SSR regressions cover every official deck in both grouped selectors, first-load visibility, errata notices across equivalent printings, and Hidden-card inspection only with a current permission. The local launcher now rebuilds before opening an existing preview server; `zsh -n` validates its syntax. Earlier checkpoints below retain their historical counts.

## Native match flow — 2 October 2026

Replaced the separate Proceed/review toolbar and action sidebar with a viewport-sized table and a single bottom decision bar. Card selection shows legal actions and costs; board targets and destinations can be clicked directly. Mulligan selection happens in the hand. Opponent actions and effect frames advance automatically. Human reactions, optional choices, movement confirmation, damage assignments and end-turn remain explicit; only a sole legal priority pass advances automatically.

All **1,036 tests in 36 files** passed, including the new native-flow suite. The production build, card coverage check and whitespace check pass. The existing Vite bundle-size warning is unchanged.

Browser verification on an isolated localhost origin covered hand replacement, automatic opponent mulligan, playing Pouty Poro, end turn through the opponent's actions back to the human, movement selection, direct damage assignment (7 → 1 → 0), the opponent's remaining combat decisions, and pause. A synthetic crowded board with 36 units, 12 hand cards and 12 runes per player was measured at 390×844 and 900×650: document dimensions matched the viewport and no card or decision control extended outside it. Normal play was also measured at 1280×720 with both battlefields, both bases, both setup pairs, the hand and all decision controls inside the viewport. The development-only reproduction page is `tests/native-flow-preview.html`; `?crowded` selects the stress fixture. These fixtures are not included in the production build.

Earlier validation entries below describe the former manual Proceed interface.

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
