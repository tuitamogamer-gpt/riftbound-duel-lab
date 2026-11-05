# Radiance rules wave 1 — 5 November 2026

## Source refresh: nothing new to import

All three sources were checked on 5 November 2026, after the 23 October Radiance release:

- **Riftcodex** still lists the same **8 sets / 1,451 printings**. It has not added Radiance; `cards.json` and `catalog-meta.json` are unchanged.
- **Hextech Analytics `set:RAD`** still advertises **219 records on 10 pages**. A full download has the same raw-source SHA-256 as the saved reference import (`988131325fae08f625fed128cffa697a80f56c54524af1c9f967258a422a8276`), so the normalized data is unchanged.
- The **official Riot card gallery** now contains the same 219 Radiance codes. Its structured fields are not yet reliable: several records have empty or contradictory type/domain facets (for example Brawl is labelled a Gear while its own image description says Spell), champion subtitles are split off, and four texts are still the pre-errata versions. It is useful as a cross-check, not as an import source.
- The new [Radiance Rules FAQ](https://playriftbound.com/en-us/news/organizedplay/radiance-rules-faq-and-clarifications/) contains rulings only; it does not change card text.

Two scripts make this check repeatable:

```bash
npm run cards:sources            # quick: Riftcodex sets/total + Hextech result total
npm run cards:sources -- --full  # also downloads every Hextech page and compares the digest
node scripts/hextech-source.mjs set:RAD /path/to/export.json   # reviewed export for import-reference-cards
```

Both are read-only with respect to the saved catalog. `hextech-source.mjs` reads the card arrays as JSON from the page payload without executing page scripts and rejects duplicate IDs, changing totals or incomplete pages.

## What became playable

Radiance printings remain reference-only by default. A printing becomes executable only when its **exact ID** is listed in `reviewedRadiancePrintings` (`src/game/radiance-wave1.ts`). Compilation, equivalent printings and reviewed aliases still cannot promote a reference printing on their own, and `scripts.ts` refuses to load if any script names an unreviewed reference printing.

This wave reviews **33 printings**: 19 card faces, two showcase K'Sante printings and all 12 Radiance runes. Every face uses behavior the engine already implements:

| Card                                                   | Implementation                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| Fury/Calm/Mind/Body/Chaos/Order Rune (+ alternate art) | Blank rune faces; the six alternates alias their base printing    |
| Bilgewater Tracker                                     | On play: 1 damage to each of up to two units                      |
| War Scout                                              | Accelerate; on play +2 Might to a unit this turn                  |
| Antagonistic Apparatus                                 | Enters ready; on play a ready 3 Might Mech token at its location  |
| Lost to the Sands                                      | Action; choose 4 damage to a unit at a battlefield or kill a gear |
| Consult the Heavens                                    | Reaction; Shield 2 this turn, then Predict                        |
| Industrious Mechsmith                                  | On play an exhausted 3 Might Mech token at its location           |
| Trinket Peddler                                        | Disarm                                                            |
| Riptide Mage                                           | Accelerate; on play −3 Might to an enemy unit this turn           |
| Supernova                                              | 10 damage to a unit, draw 2                                       |
| Sneaky Zeebles                                         | On conquer add one Power of any domain                            |
| Wrath of the Freljord                                  | Enters ready; Shield 3                                            |
| Avalanche                                              | 3 damage to every unit in either base                             |
| K'Sante, Courageous (3 printings)                      | Accelerate; Shield 2; on hold channel one **ready** rune          |
| Staunch Survivor                                       | Assault 2, Shield 2                                               |
| Siren of the Shallows                                  | Disarm, Ganking                                                   |
| Suave Negotiator                                       | On play you and your opponent each draw 1                         |
| Pitiless Stalker                                       | Exhaust: Stun an enemy unit                                       |
| Hunting Dog                                            | Deathknell: 1 Might Bird token with Deflect in your base          |
| Raucous Anthem                                         | Ready your units and give them +3 Might this turn                 |

**Disarm** is implemented exactly as its reminder text: “When I attack, give an enemy unit here −N Might this turn.” It does not trigger while defending.

Two small engine extensions support these faces: a `channel` effect may now channel ready runes (`ready: true`; every existing card keeps exhausted channeling), and `damageAll` accepts an `allBases` condition.

## Precon progress

The two Radiance Showdown lists remain reference lists until every card is executable.

| List      | Executable / distinct cards | Still missing (Radiance)                                                                                                                                                                                                                                                                                                                                 |
| --------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seraphine | 9 / 30 (was 5)              | Starry-Eyed Songstress, Seraphine (Not Alone, Inspiring), Black Rose Sanctum, Ruined Monastery, Encore, Heimerdinger, Piltovan Guidebot, Dune Devourer, The Empyrean, Steadfast Outrider, Rousing Display, Burn Away, Concert Poster, Strigian Oracle, High Note, Fanfare, Herald of the Emperor, Party Crasher, Meticulous Restorationist, For Demacia! |
| Evelynn   | 13 / 29 (was 7)             | Agony's Embrace, Evelynn (Consuming, In Control), Bandle Scouts' Academy, Rakelstake, Last Caress, Bushwhack Trap, Gutter Guardian, Demon Shade, The Good Stuff, Elnuk Herd, Reckless Innovator, Hold 'Em, The Waters' Wage, Momentary Companion, Siren's Song                                                                                           |

## Engine work needed for the rest of Radiance

The remaining 186 printings need shared mechanics that do not exist yet. In rough order of reach:

1. **Deploy** (24 faces, plus Bomb tokens): play-only-to-a-battlefield gear, killed when an opponent holds there, and “here” effects for gear at a battlefield. **Done in [wave 2](RADIANCE-WAVE2-DEPLOY.md)** for 17 faces.
2. **Show Off** (6 faces): reveal a matching card from hand or pick a friendly one while playing, then branch on whether you did.
3. **“When I become exhausted” triggers** (Strigian Oracle, Seraphine, Riven, Reckless Innovator, Resplendent Rostrum) and “three or more units exhausted at once”.
4. **Play from trash when you play a card costing 7+** (Forbidden Technique, Meticulous Restorationist) and Sanctum Conservator's ready.
5. **Predict 2/3** (multi-card look with reorder) and **Burn N**.
6. Base-Might replacement (Herald of the Emperor, Piltovan Guidebot, Lulu), dynamic cost reductions (Party Crasher, Bloodscent Swarm, Hold 'Em) and the Radiance legends and battlefields.
7. Neeko, Blending In: additional legends chosen at deck construction.

Each future wave should keep the same rule: review the complete printed face, add its exact printing IDs to the reviewed list, and add behavior tests.

## Validation

Results on 5 November 2026, run the same way as the required CI jobs:

- Full suite without the precon matrix (`--maxWorkers=4 --testTimeout=30000`): **141 files, 2,706 tests passed**, exit 0.
- Precon matrix (`tests/precon-effects.test.ts`, three `PRECON_SHARD` shards): **331 tests passed** (111 + 110 + 110), each shard exit 0.
- `npm run cards:check`, TypeScript and the production build passed.
- An earlier local run with Vitest's default 5-second timeout, started while a production build and other suites ran in parallel, reported two failures and was then stopped at the one-hour limit; the rerun above used the CI timeouts and had no failures.

Test files:

- `tests/radiance-wave1.test.ts`: registry promotion of exactly the reviewed IDs, showcase/rune variants, and behavior for every face above (including Disarm only on attack, both Lost to the Sands modes, Avalanche base-only damage and save/restore).
- `tests/reference-catalog.test.ts`: reviewed runes are accepted in imported decks; any unreviewed Radiance printing still blocks deck import and game creation; the playable ID set grows only by the reviewed printings.
- `tests/card-sources.test.ts`: Hextech payload parsing, page completeness and Riftcodex set comparison without network access.
