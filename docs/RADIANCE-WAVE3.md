# Radiance rules wave 3: face-down cards and the Evelynn list — 5 November 2026

This wave completes every card of the official **Evelynn Radiance Showdown** list, which is now a playable preset. The retail 13×13 bot matrix is unchanged. It also adds three shared rules pieces used by later waves and links Radiance alternate, showcase and reprinted printings to their source faces.

## Shared rules

- **Show Off** (Core Rules 832): offered as a play option for each matching card in hand or friendly object on the board. Facedown cards cannot be shown off (Radiance patch notes). The shown card's Energy, Power and Might are locked in at play, logged and carried by the played card's effects.
- **“When I become exhausted”**: units that were ready before an action and exhausted after it trigger once. Units exhausted by the same action count as exhausted at the same time.
- **Radiance rule families**: 41 alternate, showcase and reprint printings share the script of their source face once that face is implemented. A test compares their text, allowing only Radiance's updated templating (“a battlefield that was uncontrolled”, “is exhausted”). The family also fixes rules hooks for showcase numbers, for example Exemplar of Demacia's 176 printing.
- **Reprints**: Aphelios, Exalted; Ezreal, Dashing; Yone, Blademaster; Kayn, Unleashed; and Sett, Kingpin reuse their earlier reviewed rules.

## Cards

| Card                     | Implementation                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Elnuk Herd               | Hidden; +3 Might to a friendly unit; recycled to the bottom of its owner's deck if played face down |
| Evelynn, Consuming       | Ambush; when you play a card from face down, she readies and gets +1 Might this turn                |
| Momentary Companion      | Hidden; gains Temporary if played on an opponent's turn                                             |
| Siren's Song             | Reaction; move an enemy unit that moved this turn                                                   |
| The Waters' Wage         | Hidden; one exhausted Gold, or three ready Gold when played face down on your turn                  |
| Demon Shade              | Hidden; move a friendly unit to an open battlefield, or give it Ganking if none is open             |
| Gutter Guardian          | Hidden; Show Off a Hidden card to add 1 Power                                                       |
| Reckless Innovator       | Accelerate; when it becomes exhausted: exhausted Gold, or pay Chaos Power to draw 1                 |
| Evelynn, In Control      | Disarm; when she holds with a facedown card of yours there, score 1 point                           |
| Hold 'Em                 | Action; +3 Might; costs 2 less after you played a unit or gear to a battlefield this turn           |
| Agony's Embrace (legend) | Once each turn, a face-down play draws 1; off-turn, discard 1                                       |
| Last Caress              | Reaction; your next unit this turn, even face down, may go to any battlefield and is buffed         |
| Bandle Scouts' Academy   | Hiding a card here makes an exhausted Gold                                                          |
| Rakelstake               | The first unit or gear each player plays here each turn: Predict                                    |

## Validation

`tests/radiance-wave3.test.ts` covers every card above, the rule families and two complete bot games with the Evelynn list against retail precons. `cards:report` now fails if a complete Radiance list is not playable, or a playable one has unsupported cards.
