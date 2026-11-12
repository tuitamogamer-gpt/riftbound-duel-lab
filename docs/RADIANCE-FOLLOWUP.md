# Radiance review follow-up — 10 November 2026

The [Radiance script review](RADIANCE-REVIEW.md) left seven items open. Five are corrected here and one is confirmed by the Core Rules. Heimerdinger, Academy Instructor followed on [12 November](#12-november-2026-heimerdinger-and-local-art). Checking the recycle items turned up five more cards that recycled without the recycle event. Each correction has a regression test that fails without it (`tests/radiance-followup.test.ts`).

No card data changed. Every change applies only when one of the named Radiance cards is in the game, so retail games play exactly as before.

Rules references are to the [16 July 2026 Core Rules](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf).

## Corrected

| Card                   | Before                                                                                                       | Now                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starry-Eyed Songstress | Not offered for a spell with its own additional cost (Parallel Convergence, Sacrifice, Ki Burst)             | Offered beside an additional cost that names one board object, or none. Nonstandard costs are paid in any order (357.2), so a unit exhausted for Songstress can then be returned or killed for the spell's cost. A unit can't be exhausted for both Songstress and Ki Burst. |
| Runeblade Anvil, Akali | The permission named only the card, so an identical banished card (held by Dockside Lock-Up) could be played | Each permission names the banished copy it was given for. Permissions in older saves still match an identical card.                                                                                                                                                          |
| Last Caress            | A unit token used up the permission but could not use its "any battlefield" placement                        | A unit token whose effect leaves the location to you (Encore's Recruits) may go to any battlefield. A token that an effect plays "to your base" or "here" stays there, because the effect that creates a token sets its restrictions (185.2.a).                              |
| Predict 2+             | Recycled cards went to the bottom in their original order                                                    | Two or more recycled cards go to the bottom in a random order (416.5), drawn from the game's seeded generator, so replays repeat it.                                                                                                                                         |
| Ruined Monastery       | Read as "discard 1 to channel": with no card in hand it did nothing                                          | "You may" decides whether to perform the ability (383.3.a). Discarding is not a cost, so an empty hand still channels 1 rune exhausted (359.3.e.11). It can still be declined.                                                                                               |

Songstress is paid before the spell's own board cost. The units she exhausts therefore count for that cost: exhausting three other units can make Seraphine, Not Alone Mighty enough for Sacrifice.

## Found during the follow-up

These cards put recycled cards straight on the bottom of the deck. Karma, Channeler and other "when you recycle" rules did not see them, and several cards kept their order.

| Card               | Now                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Trifarian Captain  | "Recycle the rest" is one recycle event, in a random order                                                        |
| Command: Attack    | "Recycle the rest" is one recycle event, in a random order                                                        |
| Raving Witness     | A revealed card that isn't Mighty is recycled through the recycle event                                           |
| Scrutinizing Scope | A correctly guessed card is recycled through the recycle event                                                    |
| Mechanical Bandit  | Both revealed cards go to the bottom of their owners' decks (416.1.c) as one recycle event by Bandit's controller |

## Confirmed by the rules

**A spell needs a legal choice for every target** (355.8: "In order to put a spell or ability on the chain, valid choices must be made for all targets"). Satchel Charge ("Move a friendly unit, then play a Bomb gear token to a battlefield") can't be played without a friendly unit. The engine already works this way.

## Bot

The reference policy (the heuristic that also seeds the planner's candidates) no longer places a unit token that Last Caress lets go anywhere at a battlefield it doesn't control where enemy units stand. It prefers the base.

## Still open

- ~~**Heimerdinger, Academy Instructor**: the token is played and then replaced by the Mech, so both count as played.~~ Corrected on [12 November](#12-november-2026-heimerdinger-and-local-art).
- **Songstress and a unit that then leaves**: a unit exhausted for Songstress and then returned or killed for the spell's cost leaves before the play is complete. Its own "when I become exhausted" ability (Strigian Oracle, Reckless Innovator, Seraphine, Not Alone) does not trigger, and it does not count toward Seraphine, Inspiring's three units.

## Validation

- **Code as of commit `1ee2aa4`**: **3,011 tests in 156 files** outside the precon matrix and **331 precon-matrix tests** in three shards (111 + 110 + 110), all with exit 0 and the CI timeouts. The weekly workflow's report checks pass: **3,234 unique tests** with none failed or missing, and all **169 ordered pairings** of the 13 retail precons.
- **17 new tests** in `tests/radiance-followup.test.ts`. Each correction's tests were also run without that correction, and they failed.
- TypeScript, the production build and catalog consistency pass. The saved card inventory did not need regenerating.
- **Retail games**: eight fixed-seed bot games between retail decks were played on `edbf77c` and on the new code. Their final states are identical (SHA-256 of the whole state).
- The first full run failed two Radiance bot games. Their decks pair Starry-Eyed Songstress with Ki Burst and Life from Stone, and Songstress had exhausted the unit those spells then had to exhaust. That unit is no longer offered to her, and both games pass.

The follow-up tests also run in the required checks on every push and pull request.

## 12 November 2026: Heimerdinger and local art

### Heimerdinger, Academy Instructor

> If you would play a unit token to a location while I'm at a battlefield, you may play a 3 Might Mech unit token to that same location instead.

This is a replacement: one unit is played, the token or the Mech. The engine placed the token, announced it as played, and announced the Mech again after the swap. "When you play a unit" rules therefore saw two plays (Ephemeral Ward, Titanic Shrine, Hunters' Circle), and Last Caress's buff went to the token that the Mech then replaced.

- While Heimerdinger's choice is pending, the token is on the board but its play waits. **Keep** announces the token; **Mech** announces only the Mech.
- Zilean, Time Mage's "additional copy" follows the unit that was played, so a Mech is copied as a Mech.
- A real card played through the token flow (Flame Chompers from the trash) is not a unit token, and is no longer offered the swap.
- A choice saved before this change keeps the old behaviour: its token was already announced, and Fanfare does not count the Mech again.
- Limit: if the waiting token leaves the board before the choice (the rest of the effect that made it removes it), its play is not announced.

### Local art for the Radiance lists

The Seraphine and Evelynn lists became playable presets, but their art still came from Riot's CDN: offline matches showed text cards, and `npm run cache:art` stopped because it looked the Radiance cards up only in the provider catalog. The script now also reads the reference catalog. The local cache holds **335 images** (50 new, 5.2 MB), and a test checks that every card in every playable preset has local art. A Seraphine vs Evelynn match in the built app requested no image from Riot's CDN.

### Validation

- **Code as of commit `2e2d8bd`**: **3,018 tests in 156 files** outside the precon matrix and **331 precon-matrix tests** in three shards (111 + 110 + 110), all with exit 0 and the CI timeouts. The weekly workflow's report checks pass: **3,241 unique tests** with none failed or missing, and all **169 ordered pairings**.
- **7 new tests**: six for Heimerdinger in `tests/radiance-followup.test.ts` (three failed on the earlier code; the others guard Zilean, kept tokens and older saves) and one in `tests/art-runtime-index.test.ts`, which failed with the earlier art manifest.
- TypeScript, the production build and catalog consistency pass.
- **Retail games**: the eight fixed-seed bot games end in identical states on `fe9857f` and on the new code, as they did on `edbf77c`.
