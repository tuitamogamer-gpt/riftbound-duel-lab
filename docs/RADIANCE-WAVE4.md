# Radiance rules wave 4: the Seraphine list — 5 November 2026

This wave completes the official **Seraphine Radiance Showdown** list. Both Radiance Showdown lists are now playable presets; the retail 13×13 bot matrix is unchanged.

## Shared rules

- **Starry-Eyed Songstress**: when you play a spell, the play options include exhausting the legend and three ready friendly units for −2 Energy. A spell that is affordable only with the reduction is offered with it. Interchangeable units give one option, with at most 20 options per spell.
- **Predict N**: look at the top N cards, keep or recycle each one, then choose the order of the kept cards on top.
- **“Choose two”** (Encore): two draft steps with the same modes; a mode cannot be chosen twice, as with Curtain Call.
- **Base Might** (“becomes X this turn”) uses the engine's base-Might override, which ends at end of turn.
- **Heimerdinger, Academy Instructor**: after a unit token enters while he is at a battlefield, its controller may replace it with a 3 Might Mech at the same place.

## Cards

| Card                             | Implementation                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Fanfare                          | The next three units you play this turn each draw 1                                     |
| High Note                        | Reaction; −Might equal to the exhausted units you control                               |
| Strigian Oracle                  | When it becomes exhausted: Predict                                                      |
| Piltovan Guidebot                | When you play a card, its base Might may become that card's Energy cost this turn       |
| The Empyrean                     | Show Off a card; Predict its Power cost, then draw 2                                    |
| Seraphine, Inspiring             | Disarm 2; once each turn, may draw 1 when three or more friendly units exhaust together |
| For Demacia!                     | Reaction; friendly units at the chosen battlefield get Shield 2 this turn               |
| Herald of the Emperor            | A friendly unit's base Might becomes 5 this turn                                        |
| Meticulous Restorationist        | After you play a card costing 7+, you may play it from your trash for Order Power       |
| Party Crasher                    | Costs 1 less per exhausted friendly unit; Tank                                          |
| Burn Away                        | Banish a unit with 3 Might or less, or a gear; Burn 2                                   |
| Dune Devourer                    | May kill a friendly unit to cost 2 less; Deflect                                        |
| Rousing Display                  | Show Off a 7+ card for four Recruits instead of two                                     |
| Steadfast Outrider               | Tank; +2 Might with two or more other friendly units and/or gear at its battlefield     |
| Heimerdinger, Academy Instructor | Unit tokens may become 3 Might Mechs                                                    |
| Seraphine, Not Alone             | Recruit on play and when exhausted; +1 Might per other exhausted friendly unit          |
| Starry-Eyed Songstress           | Spell cost reduction above                                                              |
| Encore                           | Choose two different modes                                                              |
| Black Rose Sanctum               | First non-token unit of each player dying here each turn: a Recruit in its base         |
| Ruined Monastery                 | When you conquer here, may discard 1 to channel 1 rune exhausted                        |

## Validation

`tests/radiance-wave4.test.ts` covers every card above and two complete bot games with the Seraphine list against retail precons.
