# Radiance rules wave 6 — 5 November 2026

This wave adds **30 Radiance faces**. With **10 alternate printings** that share their rules through the Radiance rule families, it makes **40 more printings** playable. Radiance now has **208 of 219** printings playable. The retail 13×13 bot matrix is unchanged.

## Shared rules

- **Banished cards you may play**: Runeblade Anvil and Akali, Brash banish your top card. Until your next Ending Phase, that card is offered as a normal play from your banishment, and you pay its costs. The permission ends when you play the card or after that Ending Phase.
- **Extra Deathknell triggers**: each Detonation Amplifier you control at a battlefield makes your Deathknells there trigger one more time. This works for units and gear, including Bombs.
- **Gear abilities with Bonus Damage**: while you control Ziggs, Short-Fused, damage from your gear's abilities, such as a Bomb's Deathknell, gets +1 per Ziggs.
- **Gear exhaustion** now counts as “becomes exhausted”, as it already did for units. Resplendent Rostrum uses it.
- **Might reductions**: reducing an enemy unit's Might is recorded, so Ahri, Confident can react when it happens at her battlefield.
- **Legend abilities from units**: Heartening Soul gives your legend “Exhaust: give a unit +3 Might this turn.”
- **Equip by exhausting a unit**: Blade of the Exile can be equipped for 1 Power of any domain or by exhausting a ready friendly unit.
- **Split damage at one battlefield**: after Scorched Earth's first target, only units at the same battlefield can be chosen, and at least one target is required.
- **Instructed trash plays can be banished afterwards**: Forbidden Technique is banished after it resolves.

## Cards

| Card                       | Implementation                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Scorched Earth             | Action; 5 damage split among units at one battlefield                                                                |
| Forbidden Technique        | Ready a unit; after you play a 7+ card, may play it from trash for 1 Energy and 2 Fury, then banish it               |
| Runeblade Anvil            | On play and when it leaves the board, banish your top card and allow its play; 2 Energy + Chaos, exhaust: kill this  |
| Shimmering Swimmer         | May kill a friendly unit or gear as it is played; if so, deal 2 to a unit                                            |
| Akali, Brash               | First move each turn adds 1 Energy and 1 Power; second move banishes your top card to play                           |
| Detonation Amplifier       | Deploy; may kill another friendly unit or gear to draw 1; extra Deathknell triggers here                             |
| Ekko, Revolutionary        | Enters ready, Assault; Action: discard 1 and pay 1 Energy + Fury to blink to your base                               |
| Whirling Twirligig         | Exhaust: Gold; kill a gear: Recruit; kill a unit: 3 Might Mech                                                       |
| Ziggs, Short-Fused         | Plays a Bomb; your gear abilities deal 1 Bonus Damage                                                                |
| Blossoming Dreamroot       | Deploy; draw 1 when you win a combat here                                                                            |
| Command: Attack            | Move a friendly Deploy gear to another battlefield, or look at 5 and draw a gear                                     |
| Storm Raptor               | Deflect; draw 1 when a stunned enemy unit dies at its battlefield                                                    |
| Ahri, Confident            | Disarm; +1 Might this turn when you reduce an enemy unit's Might at her battlefield                                  |
| Heartening Soul            | Readies your legend; your legend gains “Exhaust: +3 Might”                                                           |
| Riven, Broken Blade        | When she becomes exhausted, a mode not yet chosen this turn: buff her, or spend it to stun or ready                  |
| K'Sante, Dauntless         | Shield; when he attacks or defends, double a friendly unit's Shield here this turn                                   |
| Resplendent Rostrum        | Exhaust: draw 1 and channel 1 exhausted; when it becomes exhausted, +3 Might to a friendly unit                      |
| Improvised Projectile      | Action; damage equal to a friendly gear's Energy cost to a unit at a battlefield                                     |
| Scrutinizing Scope         | 1 Energy, exhaust: the opponent guesses a type; reveal your top card and recycle it if right, otherwise draw it      |
| Orianna, Mechanical Marvel | Once each turn at a battlefield, a gear costs 1 Energy and 1 Power less                                              |
| Zero Point Inflection      | Draw 2 when you play a card; drawing with 9+ other cards discards your hand, kills it and gives the opponent a point |
| Graves, Blasting Through   | When he attacks or defends, damage equal to his Might to each enemy unit here; no combat damage                      |
| Mechanical Bandit          | Beginning Phase: both players reveal; draw yours if it is the cheapest, recycle the rest                             |
| Angler Wyrm                | Deflect; exhaust: the opponent moves one of their units to its battlefield                                           |
| Riven, Deserter            | +1 Might when another friendly unit becomes exhausted; once each turn, exhaust a friendly unit to ready a unit       |
| Transpositionist           | Chaos, exhaust: return a friendly unit, then may play a unit with less Might from hand for free                      |
| Battlefield Armorer        | Pay 1 to return a friendly gear that died at a battlefield to hand                                                   |
| Boy Who Shattered Time     | Empower for 1 Energy; disempower: the next unit costs 2 Energy and 1 Power less and dies at end of turn              |
| Hexplosive Minefield       | Action; kill any number of your Bombs, then play that many to one battlefield at end of turn                         |
| Blade of the Exile         | +3 Might and Ganking; Equip for 1 Power or by exhausting a friendly unit                                             |

The alternate printings of Akali, Ekko (two), Ziggs, Ahri, both Rivens, K'Sante, Orianna and Boy Who Shattered Time use the same rules.

## Notes

- **Improvised Projectile**: the gear is chosen when the spell resolves; the largest Energy cost is offered first.
- **Riven, Broken Blade**: the mode is chosen when the ability resolves, so it uses her buff at that time.
- **Riven, Deserter and Whirling Twirligig**: the unit or gear used for the cost is chosen when the ability resolves.
- **Tokens are not cards**: playing a token does not trigger Zero Point Inflection or Forbidden Technique, and does not use Orianna's or Boy Who Shattered Time's discount.

## Remaining work

The 11 unsupported Radiance printings cover 8 cards: Mordekaiser, Twice Slain; Gravity Field; Dockside Lock-Up; Chronobreak; Iron Revenant; Lady of Clockwork; The Ball; and Neeko, Blending In. They need death replacement, movement taxes, gear that becomes a unit, Power restricted to units and gear, and extra legends chosen at deck building.

## Validation

`tests/radiance-wave6.test.ts` has 33 tests covering every face above.
