# Card import and executable coverage

<!-- card-catalog-summary:start -->

Saved catalog fetched **6 October 2026**: **1,451 provider printings** in **8 sets**, plus **8 local rules tokens**. Completeness is relative to Riftcodex; its latest reported record update is **21 July 2026**.

Executable registration: **1,459 / 1,459 entries**, with **0 unsupported** (1,108 scripted, 37 compiled, 314 aliases). Counts include printings and tokens, rather than only distinct card designs.

Retail precons: **13 / 13** have complete executable coverage. All 13 lists have valid structure and complete catalog references. Historical retail contents and current tournament legality remain separate.
<!-- card-catalog-summary:end -->

Provider completeness is checked against both pagination totals and each set's card count. It does not establish that Riftcodex contains every Riot publication or preview. No Radiance set is returned in this snapshot. The generated summary above and [per-card inventory](card-coverage.json) are maintained by `cards:report` and verified by `cards:check`.

## Current implementation — 7 October 2026

The [next 100 printing batch](IMPORT-100-SOURCES.md) and [remaining 107 printing batch](IMPORT-107-SOURCES.md) completed executable registration for the saved catalog. The latter added three local rules tokens. Shared support now includes effect-directed plays, physical ownership, hybrid Unit/Gear objects, copied ability instances, death replacements, extra turns, multiple paid repeats, staged target declarations and deck inspection/reveal choices. Original provider records, card text, printing identities and constructed-ban flags are preserved.

The [validation log](VALIDATION.md) records the actual completed test runs and their limits. Registration covers the full saved catalog; a registry entry alone does not prove every possible rules interaction.

## Historical implementation checkpoints

The wave sections below record coverage and remaining work at their own checkpoints. Their unsupported counts and limitations are historical; the generated summary above gives current coverage.

## Twelfth implementation wave — 7 October 2026

This continuation implements **five card faces / five previously unsupported printings**: Wallop, Call to Glory, Legion Quartermaster, Zaun Punk and Sacrifice. Their scripts use explicit physical objects to pay additional costs: spend a buff, return friendly gear, kill friendly gear or kill a Mighty friendly unit. See the [source ledger](CARD-WAVE12-SOURCES.md) for card references and current Core Rules. Catalog records and original text are preserved.

Costs are selected independently from effect targets and paid before responses. Optional buff payments ignore the base cost while retaining taxes. Mandatory costs also apply to Hidden and champion-zone plays. Mighty eligibility is checked after Energy and Power payment, since recycling runes or spending Power can change it. Triggers produced by payment wait until the played card is finalized; paid costs and subsequent choices survive save/load. Payment labels are translated in all three supported languages.

**207 printings remain unsupported.** This wave does not add effect-directed plays, copying, control changes, extra turns or the remaining incomplete Equipment.

## Eleventh implementation wave — 7 October 2026

This continuation implements **six card faces / six previously unsupported printings**: Sterak's Gage, Edge of Night, Forgefire Cape, Shurelya's Requiem, Hunter's Machete and Shepherd's Heirloom. Their missing attachment panels were checked against [official Riot images](EQUIPMENT-WAVE11-SOURCES.md). Catalog records and original card text are preserved.

The engine now carries Hidden battlefield restrictions into gear play triggers, grants continuous nearby Equipment keywords and pays XP-based Equip costs before responses. Weaponmaster retains non-Power costs. Tests cover Quick-Draw, Hidden attachment, area damage without target taxes, live-source locations, universal Equip Power, Unique limits, ready prohibitions, mobile Ganking auras, independent Hunt triggers and saved paid abilities.

**212 printings remain unsupported.** This package does not implement copying, ownership changes, effect-directed plays, extra turns or the remaining incomplete Equipment.

## Tenth implementation wave — 7 October 2026

This continuation implements **13 card faces / 19 previously unsupported printings**: Recurve Bow, Doran's Shield, Brutalizer, Cloth Armor, World Atlas, Hexdrinker, Trinity Force, Boneshiver, Doran's Ring, Boots of Swiftness, Cull, Eye of the Herald and Spinning Axe. Their missing attachment panels were checked against [official Riot card images](EQUIPMENT-WAVE10-SOURCES.md). Provider text remains intact; the complete attachment effect now appears in card details and hover previews.

The shared engine grants Equipment keywords, conditional Might and independent attack/defend, move, conquer and hold triggers to the attached unit. Trigger targets and costs precede responses, and previously created abilities survive Equipment removal. Re-equipping transfers future benefits; Brutalizer retains its attachment turn through save/load. Spinning Axe supports universal Equip Power and survives its Beginning Phase while attached. Rockfall Path and additional hold/conquer occurrences include inherited Equipment abilities.

**218 printings remain unsupported.** The catalog itself is unchanged from the 6 October provider refresh. Effect-directed plays, control changes, copying, extra turns, multiple Repeat and the remaining incomplete Equipment faces still require implementation.

## Ninth implementation wave — 6 October 2026

This continuation implements **12 card faces / 17 previously unsupported printings**: Ravenborn Tome, Imperial Decree, Noxian Guillotine, Ornn (Fire Below the Mountain), Azir (Emperor of the Sands), Red Brambleback, Blue Sentinel, Affectionate Poro, Astral Heron, Otterpus, Fallen Feline and Piltovan Forge. Their scripts are in `card-wave9.ts`; equivalent printings still require the registry's full gameplay fingerprint.

The engine now keeps next-spell damage bonuses, delayed damage-triggered kills, gear-only Power, first-gear-ability discounts, equipment-play permission, delayed Main-phase Power and the next-card discount. Extra conquer/hold triggers are additive and pay their own costs, while the ordinary point happens once. Poro remembers actual damage even after healing. Fallen Feline names a spell through a searchable, resumable choice; card inspection shows the public name and the restriction applies only while Feline is at a battlefield. Pending effects and resource pools survive save/load.

The wave also corrects Teemo, Strategist from wave eight: the official erratum makes his ability trigger on defending only. Entering from Hidden does not add another trigger. Both Teemo's correction and Astral Heron's discount timing appear beside the preserved provider text in card inspection.

**237 printings remain unsupported.** Effect-directed card plays, ownership changes, copy effects, extra turns, incomplete Equipment panels and multiple Repeat instances remain separate work. Provider data and original printed text are unchanged.

## Eighth implementation wave — 6 October 2026

This continuation implements **12 card faces / 16 previously unsupported printings**: Ekko, Recurrent; Teemo, Strategist; Fox-Fire; Void Drone; Emperor's Divide; Overzealous Fan; Drag Under; Azir, Sovereign; Tricksy Tentacles; Corrupted Dragon; Decree of Discord; and Acceleration Gate. Their scripts are in `card-wave8.ts`; equivalent printings retain the registry's full gameplay-fingerprint checks.

Board target groups now use a staged selection with a persistent confirmation control. All targets, shared destinations and Deflect costs are finalized before payment and responses. The options grow with the number of objects, without generating every possible subset. A reaction that invalidates the group's total Might or shared location opens a saved, resumable subset choice restricted to the original targets. Hidden choices remain local. Acceleration Gate can include units, gear and runes belonging to either player. Selection clicks update immediately.

Ekko recycles the exact physical trash visit as a trigger cost, before responses; a different copy cannot substitute for it. Overzealous Fan likewise pays its self-sacrifice before its effect enters the chain. Teemo reveals and recycles the top five cards and deals unit-sourced damage for the Hidden cards. Azir uses his live battlefield on resolution. Corrupted Dragon checks the current victory threshold. Void Drone and Drag Under apply their discount to plays from outside hand, including granted Flow where applicable.

The provider catalog and original printed text are unchanged. **254 printings remain unsupported**; effect-directed card plays, ownership changes, copy effects, missing Equipment panels and multiple Repeat instances are still separate work. The new unrestricted group selection covers the listed faces, not every independent multi-target effect.

## Seventh implementation wave — 6 October 2026

This continuation adds **28 card faces** in `card-wave7.ts`. Together with reviewed alternate printings, **84 previously unsupported entries** are executable. Heroes include Dr. Mundo, Miss Fortune, Jinx, Teemo, Jax, Sivir, Hwei, Jayce, Kayle, Kai'Sa, Renekton, Nasus and Kennen. The other new faces are Mageseeker Warden, Forge of the Future, Guerilla Warfare, Guardian of the Passage, Aspiring Engineer, Prize of Progress, Angle Shot, Disposal Order, Starhound, Esteemed Hierophant, Shadows of the Past, Not So Fast and Repulse.

Trash cards now retain a physical identity for each visit to that zone. Public targets are declared before payment and responses, and losing one selected copy does not substitute an identical copy. Multi-card declarations use a staged selection with a persistent confirm button, including zero targets where allowed, and survive save/load. Candidate generation stays linear for large trashes. Older saves retain their existing discard arrays and are reconciled without mutating read-only queries.

The shared engine records discard batches, resolves activated-ability play triggers after the ability finishes, and preserves such an ability through its saved intermediate choices. It supports restricted spell Power and unit Energy, Kennen's turn-limited Flow on a specific trash card, optional readying of other objects, repeated Kayle empowerment, Teemo's alternative hide payment, and Jax's dynamic Quick-Draw. Not So Fast and Repulse can counter appropriate spells and abilities without trashing the ability's source. Reviewed premium aliases ignore only reminder formatting for an explicit face list; type, tags, costs and all other gameplay attributes must still match.

All provider records and printed rules text remain unchanged. The remaining **270 unsupported printings** include effect-directed card plays, control changes, copy effects, multiple Repeat instances, unrestricted board target groups and Equipment with missing attachment panels. They remain unavailable to playable decks until the whole effect is implemented.

## Sixth implementation wave — 4 October 2026

This wave adds **29 card faces and 39 executable printings** through `card-wave6.ts`. New support includes Brynhir, Blitzcrank, Karthus, Stormbringer, Yasuo's Legend, Showstopper, Piercing Light, Bellows Breath, Fae Dragon, Temptation, Beast Below, Imposing Challenger, Stare Down, Moonfall, Ol' Poro, Sandstone Chimera, Decree of Focus, Riven, Helm of Suppression, Applied Researchers, Stargazer and Public Execution. The battlefield rules cover Aspirant's Climb, Forgotten Monument, Marai Spire, Rockfall Path, Heisho, Mystic Vortex and Sandswept Tomb.

The shared cost pipeline applies alternative and additional costs before taxes and discounts, including colored Repeat costs, Deflect, Hidden, Flow, Ambush and spell-only Energy. Limited discounts keep their one-Energy floor, and universal Power discounts can cover additional costs. Group targets and movement destinations are declared before responses; Bellows can select a legal subset of its original targets after they separate. Simultaneous damage preserves Karthus's additional Deathknell triggers when Karthus dies with the other units. The match score display follows Aspirant's Climb's changed victory threshold.

At the sixth-wave checkpoint, **354 printings were unsupported**. Unknown effects still failed closed; Syndra's multiple Repeat instances, public-trash identities and unrestricted-size target groups remained separate implementation work. The provider catalog and card text were unchanged by that wave. Existing deck imports automatically use the expanded executable registry.

## Fifth implementation wave and website deck import — 4 October 2026

This continuation adds 25 explicit card faces in `card-wave5.ts`, making **34 previously unsupported printings** executable through their equivalent variants. New support includes Falling Star, Facebreaker, Last Breath, Leona, Janna, Kayn, Miss Fortune, Ornn, Jax, Weaponmaster units, Counter Strike, Lotus Trap, Switcheroo, Smoke and Mirrors, Irresistible Faefolk, and battlefield/Hidden rules. The catalog refresh returned the same 1,451 provider records; no card text was changed.

Shared behavior now includes repeated target selection and Deflect payments, unit-sourced damage, one-event damage prevention, damage doubling, movement-count protection, a second Hidden slot at Bandle Tree, and upfront Equipment selection for Weaponmaster (including existing precons). Pending choices and new turn-scoped effects survive save/load. Janna and Falling Star use the official Spiritforged errata shown beside the original printed text.

The website importer uses the upstream Piltover Archive codec locally, with strict bounded packet validation for versions 1–6. It accepts text exports with names or set codes, retains sideboards, and asks for a chosen champion when old codes omit it. Page URLs need an export first; additional-legend formats and unsupported in-game effects remain explicit errors. Sideboards are validated and preserved but are not playable in the single-game Duel flow.

At the fifth-wave checkpoint, **393 printings were not scripted**. In particular, public-trash targeting still needs durable object identities before Dr. Mundo, Guardian's Passage, Aspiring Chronomancer and Starhound Pack can be advertised as supported. Variable-size target declarations still block cards such as Azir, Ascendant. Unknown effects continue to fail closed.

## Fourth implementation wave

This continuation implements **94 previously unsupported printings** through 55 rules families in `origins-wave4.ts`, `unleashed-wave4.ts`, and `vendetta-wave4.ts`. It also withdraws the two Patched Porobot records: the official Vendetta FAQ makes it both Unit and Gear, which the engine does not yet implement completely. The registry explicitly blocks both compilation and aliases from restoring this incomplete face. The net increase is 92 executable entries, from 937 to 1,029. The provider catalog and its original text remain unchanged.

The wave adds typed Power, showdown-only Energy, optional XP play costs, compound targets and destination declarations, new movement and readying restrictions, Temporary-trigger suppression, and turn-limited permission to inspect an opponent's Hidden cards. Defender of Tomorrow's abilities use the shared activation pipeline, including Heimerdinger's copied abilities. Focused suites cover costs before responses, target revalidation, partial resolution, private choices, and save restoration. Raw Might arithmetic is retained for increase/doubling effects before applying the normal zero floor.

Official corrections for Deathgrip, Guards!, Tideturner, Tianna Crownguard and Rengar appear beside the preserved printed text in card inspection. See [rules research](RULES-RESEARCH.md) for the source links and tested differences. At that checkpoint, Brynhir, Facebreaker and Rockfall Path remained unsupported pending the required general engine support.

All 13 retail precons are now visible by default. Separate grouped selectors expose every deck for both players regardless of the current gallery filter. The match toolbar's **Decks** button returns to the picker. The local launcher rebuilds before opening so it cannot silently reuse an old distribution.

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

`src/data/cards.json` preserves source card text, attributes and public artwork URLs. `src/data/catalog-meta.json` records fetch start/end, source totals, per-set counts, provider update time, a SHA-256 digest and the import's completeness scope. An incomplete response, duplicate provider ID, changed total, missing set, invalid card or unexplained removed printing aborts the import. Deliberate removals require running `node scripts/sync-cards.mjs --allow-removals`, followed by `npm run cards:report`. Old local IDs are retained when an upstream identifier changes unambiguously. Reporting also checks the saved catalog digest, IDs, per-set totals and bundled precon structure before publishing the inventory; `cards:check` verifies both documentation summaries as well as the JSON report.

Every printing and local rules token is registered by `src/game/card-registry.ts`. The reproducible [card-coverage.json](card-coverage.json) contains every record, its executable script where available, its rules identity and one of these statuses:

- `scripted`: an explicit card implementation with engine hooks.
- `compiled`: the complete text matches a closed grammar of supported rules.
- `alias`: an equivalent printing shares an executable rules face.
- `unsupported`: the required full effect is not implemented; the reason remains visible in the inventory.

The compiler never marks a recognized prefix as a complete card. Unknown text, unsupported conditions, independently selected multiple targets and equipment with a missing printed effect panel are rejected. Explicit scripts take precedence. Aliases require matching rules text, type, costs, Might, domains and tags as well as the normalized name; only an explicit reviewed face list permits reminder-text formatting differences. A matching collector number alone is insufficient.

The deck importer preserves the selected printing for storage and export. Match initialization converts equivalent printings to the rules ID so exact-ID engine hooks still execute. Printed variants share name-based copy limits. The engine itself rejects an unsupported deck even when a caller bypasses the lobby.

## Validation scope

Importer tests simulate changing or incomplete pagination, invalid fields, conflicting/changed source IDs, set totals and removed cards; they also check the saved catalog's digest. Registry tests enumerate every printing, reject false aliases, test alternate-art copy limits and reproduce the former Vendetta collector-number collision.

Compiler and expansion tests execute real legal actions and assert costs, targets, effects, priority, source snapshots, choices and save restoration. Existing precon tests include all 169 ordered matchups, deterministic simulations, card conservation and manual review. These tests establish the checked behavior; **full executable registration does not establish every interaction**. The inventory reports exact support status and any missing-effect reason after future catalog refreshes.

The expanded modules cover Origins, Spiritforged, Unleashed and Vendetta. Shared regressions cover countering the selected spell, Flow banishment on counter, modes declared before responses, rune targets chosen before their trigger resolves, Empower events, no-combat-damage and movement restrictions, optional battlefield triggers, Spiderling's unlimited-copy rule, and play ordinals retained across reactions. Countered spells do not fire resolved-play triggers. Read-only queries do not mutate a match, and mixed-expansion games conserve cards and restore pending choices.

Current remaining work is broader interaction validation and any new cards returned by a future provider refresh. The earlier unsupported mechanics are covered by later implementation batches; there are no unsupported entries in the current snapshot. Missing provider equipment panels remain preserved as provider text, with independently sourced printed effects supplied by explicit scripts and shown in card inspection.
