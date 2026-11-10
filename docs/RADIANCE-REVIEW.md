# Radiance script review — 10 November 2026

Every Radiance script was read again against its printed text, card by card, together with the shared rules added for Deploy, Show Off, Predict and more than one legend. The review reported **48 differences**. **42 are corrected** here, each with a regression test that failed before the change. The other six, and three parts of corrected cards that remain, are listed under [Left open](#left-open).

No card data changed. The retail 13×13 bot matrix is unchanged: eight fixed-seed bot games between retail decks were played before and after the changes and took the same actions to the same result.

## Shared rules

- **Unit tokens are units you play.** Rules that react to "a unit you play" now see unit tokens: Ephemeral Ward, Titanic Shrine, Firelights' Hideout, Hunters' Circle, Fanfare, Last Caress, Hold 'Em and Rakelstake. "Units enter ready" rules (Firebrand Raider, The Exile) also ready unit tokens.
- **Tokens are not cards.** Piltovan Guidebot ("when you play a card") ignores tokens, and a token cannot be shown off as "a card" (The Empyrean), only as a Mech, a unit or a gear.
- **Gear with Deflect.** Watchful Curator's Deflect is charged when a gear is chosen from a list of options (Mordekaiser, Dominating; Mournful Spirit), as it already was for targeted spells.
- **"Can't move this turn"** (Entrenched Boar, Hunker Down) also stops effects from moving the unit. Vex's "they can't move it" still only removes the move action.
- **Deployed gear on the other boards.** The online board, the replay viewer, target labels and the phone zone focus placed [Deploy] gear in its owner's base. They now use its battlefield, like the main table.
- **Damage to all units** hits each unit once. A unit carrying copied-text Equipment (Svellsongur) was hit twice. This also corrects the same effect in the earlier sets.

## Corrected cards

| Card                              | Correction                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bomb token                        | Your other Bombs there die even when no enemy unit can be chosen for the 2 damage                                                           |
| Lingering Animus                  | Spending a Gold token ("Kill this") counts as a friendly gear dying                                                                         |
| Firebrand Raider, The Exile       | Unit tokens enter ready                                                                                                                     |
| Entrenched Boar, Hunker Down      | The unit is not moved by Stoic Ferryman, Cataclysm or Jarvan IV either                                                                      |
| Invigorating Bloom                | The Mighty unit is exhausted as the ability is activated, not when it resolves                                                              |
| Nazuman Ntofo, Protector's Shield | Equip costs 1 Energy; it also charged 1 Power                                                                                               |
| Protector's Shield                | Quick-Draw attaches it when played; it gives +1 Might                                                                                       |
| Mournful Spirit                   | May kill Equipment attached to a unit there, or a gear in that base                                                                         |
| Demacian Illuminators             | One trigger for a batch of deaths, whatever the order of the dying units                                                                    |
| Remember the Fallen               | Plays up to three cards; it played one                                                                                                      |
| Black Market                      | Offered whenever 2 Power can be paid, including by recycling exhausted runes                                                                |
| Steadfast Outrider                | +2 Might only at a battlefield                                                                                                              |
| The Empyrean                      | Predict first, then draw 2                                                                                                                  |
| Gutter Guardian                   | Shows off only cards that have [Hidden], not cards that mention it                                                                          |
| Predict 2+, Encore, Elnuk Herd    | Recycled cards raise the recycle event (Karma, Channeler)                                                                                   |
| Runeblade Anvil                   | Also triggers when it is banished                                                                                                           |
| Whirling Twirligig                | Its Recruit and Mech use the normal choice of location                                                                                      |
| Blossoming Dreamroot              | No draw for a showdown that never became a combat                                                                                           |
| Ahri, Confident                   | Realm of Death's −2 Might counts as reducing Might                                                                                          |
| Orianna, Mechanical Marvel        | A gear played for free does not use up the discount                                                                                         |
| Riven, Deserter                   | A unit that is exhausted and readied by her ability still became exhausted                                                                  |
| Battlefield Armorer               | Returns the gear that died, not another copy in the trash                                                                                   |
| Hexplosive Minefield              | Bombs owed from the opponent's turn are played at the end of that turn                                                                      |
| Blade of the Exile                | Can be equipped by exhausting a unit without any Power available                                                                            |
| Dockside Lock-Up                  | The banish respects "can't be chosen" and Deflect                                                                                           |
| Gravity Field, Dockside Lock-Up   | Keep their battlefield rules while Lady of Clockwork makes them units                                                                       |
| Lady of Clockwork                 | A gear keeps its own state when it stops being a unit; its Beginning and End triggers fire once; no paid trigger when no gear can be chosen |
| The Ball                          | Triggers only when its controller moves it                                                                                                  |
| Neeko, Blending In                | "Different legends" compares the legend's name without printing labels, in deck building and in play                                        |

## More than one legend

- A Neeko-added legend's "here" targets resolve (LeBlanc's Reflection becomes a copy and is Temporary).
- With Mel and Ambessa both in the Legend Zone, each is empowered when you empower something else.
- A legend whose Neeko left the board is neither ready nor Empowered; it no longer read the starting legend's state.
- Hall of Legends readies the first exhausted legend.
- A Neeko-added Annie's end-of-turn trigger shows her own card.

## Left open

The [follow-up of the same day](RADIANCE-FOLLOWUP.md) resolves most of these; each item ends with its status.

- **Starry-Eyed Songstress** is not offered for a spell that has another additional cost (Parallel Convergence). _Corrected._
- **Runeblade Anvil and Akali, Brash** store the permission by card, not by banished copy. If another effect holds an identical banished card (Dockside Lock-Up), the wrong copy can be played. _Corrected._
- **Last Caress** is used up and buffs a unit token, but a token still cannot use its "any battlefield" placement. _Corrected for tokens whose effect leaves the location open; a token played "to your base" stays there (rule 185.2.a)._
- **Heimerdinger, Academy Instructor**: the replaced token and the Mech both count as played (the documented "replace after it enters" simplification). Fanfare counts the pair once. _Still open._
- **Predict 2+** puts recycled cards on the bottom in their original order. _Corrected: random order (rule 416.5)._
- **Ruined Monastery** keeps the "discard 1 to channel" reading. _Corrected: an empty hand still channels (rules 383.3.a and 359.3.e.11)._
- **Spells need a legal target for their first targeted effect** (Satchel Charge without a friendly unit). This is the engine's rule for every set. _Confirmed by rule 355.8._

## Validation

- **Before the changes**, commit `c06acac`: **2,932 tests in 149 files** outside the precon matrix, exit 0 with the CI timeouts.
- **After the changes**, code as of commit `879ee6f`: **2,994 tests in 155 files** outside the precon matrix and **331 precon-matrix tests** in three shards (111 + 110 + 110), all with exit 0 and the CI timeouts. The weekly workflow's report checks pass on these runs: **3,217 unique tests** with none failed or missing, and all **169 ordered pairings** of the 13 retail precons.
- **62 new tests**: 58 for the corrections above (`tests/radiance-review-*.test.ts`) and 4 for the deployed-gear displays.
- TypeScript, the production build and catalog consistency pass. The saved card inventory was regenerated for the changed scripts.
- The built app was opened in Chromium with the Seraphine and Evelynn lists and a duel was started; no page errors.
- **Retail games**: eight fixed-seed bot games between retail decks took the same number of actions and turns to the same winner before and after. Their final states differ only by one internal key that the old Demacian Illuminators rule wrote in every game and the new rule no longer needs.

The Radiance rule tests, the legend zone tests and the online board test now also run in the required checks on every push and pull request.
