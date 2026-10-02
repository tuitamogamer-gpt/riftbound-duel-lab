# Card import and executable coverage

The catalog was fetched again on 2 October 2026. It contains every printing returned by the paginated Riftcodex API: 1,451 printings in eight sets, plus five local rules tokens. Provider completeness is checked against both pagination totals and each set's card count. It is not independent evidence that Riftcodex has every Riot publication or preview; its latest reported record update was 21 July 2026. No Radiance set is returned in this snapshot.

Current checked snapshot: **937 executable entries and 519 unsupported entries**, including the five local rules tokens. These counts refer to printings, not unique gameplay cards. Validation passes **961 tests across 31 files**, including 169 precon pairings and 16 mixed-expansion integration games.

## Third implementation wave

This continuation implements **130 of the previous 649 unsupported printings** and adds the official-rules Tentacle token. The executable registry increases from 806 to 937 entries. The original 1,451 provider records and their text are unchanged.

The new modules are `src/game/origins-wave3.ts` (28 Origins/Spiritforged faces), `src/game/unleashed-wave3.ts` (25 faces), and `src/game/vendetta-wave3.ts` (28 faces, with explicitly checked full card codes and equivalent provider records). They are registered through `scripts.ts` and the expansion engine. Their focused test files contain 57, 66, and 63 tests respectively. Riot image URLs and the verified missing attachment panels for Pendulum Blade and Jagged Cutlass are recorded in `vendettaWave3Sources`.

Shared support now finalizes leading Energy/Power/XP/exhaustion/recycle costs before responses, freezes modal choices and exact targets, validates saved intermediate choices, and records explicit targeting and the acting player. Triggered effects generated during an instruction wait until that instruction sequence finishes. Ordinary self-references do not generate targeting events. Repeat retains a separate mode and target for each execution and pays colored Power and spell-only Energy correctly. Combat completion waits for optional death triggers; completed games retain a valid terminal save.

Protection checks cover dynamic target immunity, enemy movement prevention, damage prevention while outside combat, and live-source “here” references. New integration fixtures run 16 mixed-expansion games alongside the existing 169 precon pairings. Unknown cards remain rejected by match initialization.

## Refresh and verify

```sh
npm run sync:cards    # validate source pages, preserve saved IDs, refresh catalog and coverage
npm run cards:report  # regenerate the complete card/script inventory after implementation changes
npm run cards:check   # fail if the checked-in inventory no longer matches the engine
npm test
npm run build
```

`src/data/cards.json` preserves source card text, attributes and public artwork URLs. `src/data/catalog-meta.json` records fetch start/end, source totals, per-set counts, provider update time, a SHA-256 digest and the import's completeness scope. An incomplete response, duplicate provider ID, changed total, missing set, invalid card or unexplained removed printing aborts the import. Deliberate removals require running `node scripts/sync-cards.mjs --allow-removals`, followed by `npm run cards:report`. Old local IDs are retained when an upstream identifier changes unambiguously.

Every printing and local rules token is registered by `src/game/card-registry.ts`. The reproducible [card-coverage.json](card-coverage.json) contains every record, its executable script where available, its rules identity and one of these statuses:

- `scripted`: an explicit card implementation with engine hooks.
- `compiled`: the complete text matches a closed grammar of supported rules.
- `alias`: an equivalent printing shares an executable rules face.
- `unsupported`: the required full effect is not implemented; the reason remains visible in the inventory.

The compiler never marks a recognized prefix as a complete card. Unknown text, unsupported conditions, independently selected multiple targets and equipment with a missing printed effect panel are rejected. Explicit scripts take precedence. Aliases require matching rules text, type, costs, Might, domains and tags as well as the normalized name. A matching collector number alone is insufficient.

The deck importer preserves the selected printing for storage and export. Match initialization converts equivalent printings to the rules ID so exact-ID engine hooks still execute. Printed variants share name-based copy limits. The engine itself rejects an unsupported deck even when a caller bypasses the lobby.

## Validation scope

Importer tests simulate changing or incomplete pagination, invalid fields, conflicting/changed source IDs, set totals and removed cards; they also check the saved catalog's digest. Registry tests enumerate every printing, reject false aliases, test alternate-art copy limits and reproduce the former Vendetta collector-number collision.

Compiler and expansion tests execute real legal actions and assert costs, targets, effects, priority, source snapshots, choices and save restoration. Existing precon tests include all 169 ordered matchups, deterministic simulations, card conservation and manual review. These tests establish the checked behavior; a registry entry does not establish every interaction, and **the entire catalog is not yet playable**. The inventory gives exact remaining cards rather than silently treating unsupported text as blank.

The expanded modules cover Origins, Spiritforged, Unleashed and Vendetta. Shared regressions cover countering the selected spell, Flow banishment on counter, modes declared before responses, rune targets chosen before their trigger resolves, Empower events, no-combat-damage and movement restrictions, optional battlefield triggers, Spiderling's unlimited-copy rule, and play ordinals retained across reactions. Countered spells do not fire resolved-play triggers. Read-only queries do not mutate a match, and mixed-expansion games conserve cards and restore pending choices.

Remaining work includes cards needing a generalized additional-cost/effect-play pipeline, sacrifice/self-recycle trigger costs, public-zone and independent multi-target choices, ownership changes, replacement/prevention effects, extra turns, and equipment panels absent from the provider's text. Those cards are present in the catalog and registry with `unsupported` status. Importing all provider records is complete; implementing every card effect is not.
