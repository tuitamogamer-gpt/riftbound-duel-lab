# Radiance rules wave 7 — 5 November 2026

This wave adds the last **7 Radiance faces** that the engine can run. With **3 alternate printings**, it makes **10 more printings** playable. Radiance now has **218 of 219** printings playable. The retail 13×13 bot matrix is unchanged.

## Shared rules

- **A gear that becomes a unit** (Lady of Clockwork): the gear stays a gear and is also a unit, with base Might equal to its Energy cost. It moves, fights and dies as a unit, and keeps its gear abilities. A “base Might becomes X this turn” effect still overrides it for that turn. It stops being a unit when you choose another gear. Saved games keep it.
- **Power only for units or gear** (Iron Revenant): a separate pool that is spent first on units and gear and never on spells or abilities. It empties at the same points as the other restricted pools.
- **“Pay any amount of Power”** (Chronobreak): each amount from 1 to the number of your units is a separate play option, plus the option of paying nothing.
- **Movement taxes** (Gravity Field): an opponent's move to its battlefield costs 1 Energy and 1 Power, once per move however many units go.
- **Death replacement with a cost** (Mordekaiser, Twice Slain): once each turn, you may kill another friendly unit instead; Mordekaiser heals, exhausts and goes to your base. That unit dies afterwards, in its own batch.
- **Playing from banishment**: taking a card from banishment now keeps the internal list of banished entries in step. Before, playing one of two identical banished cards could lose track of the other.

## Cards

| Card                     | Implementation                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Mordekaiser, Twice Slain | Accelerate, Assault 3; once each turn, may kill a friendly unit to heal, exhaust and recall instead of dying                                |
| Gravity Field            | Deploy; opponents pay 1 Energy and 1 Power to move to its battlefield; Deathknell: draw 1                                                   |
| Dockside Lock-Up         | Deploy; banishes a unit at its battlefield; when you hold there, may kill itself to play that card for free under your control              |
| Chronobreak              | Pay any amount of Power; banish that many of your units, then each owner plays them back to the same place or base, in the order you choose |
| Iron Revenant            | Reaction: exhaust and banish a unit or gear from your trash to add 1 Power for units or gear                                                |
| Lady of Clockwork        | Start of your Main Phase: may pay 1 Energy to turn a friendly gear into a unit                                                              |
| The Ball                 | Deploy, Ganking as a unit; when played or moved: draw 1, or deal 2 to each enemy unit at its battlefield                                    |

The alternate printings of Mordekaiser, Iron Revenant and Lady of Clockwork use the same rules.

## Notes

- **The Ball**: the mode is chosen when the ability resolves.
- **Iron Revenant**: one option is offered for each different unit or gear card in your trash.
- **Lady of Clockwork**: only gear that is not attached to a unit can be chosen.

## Not playable: Neeko, Blending In

Neeko stays reference-only. Her deck-building rule lets you choose up to three more legends, and playing her adds one of them to your Legend Zone. Supporting her needs:

1. a deck field for the extra legends, with builder controls, import and export;
2. a second legend in play, with its own abilities and exhausted state. About 116 legend checks in 35 engine files assume one legend per player.

Treating her as a plain unit would be a legal choice (no extra legends) but would hide most of the card, so she is not offered for play.

## Validation

`tests/radiance-wave7.test.ts` has 9 tests covering every face above, including saved-game checks for Lady of Clockwork, Iron Revenant and Dockside Lock-Up.
