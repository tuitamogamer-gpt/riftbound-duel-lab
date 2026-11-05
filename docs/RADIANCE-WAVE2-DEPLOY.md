# Radiance rules wave 2: Deploy — 5 November 2026

This wave implements the **Deploy** keyword, the **Bomb** gear token and the Radiance cards built around them. It reviews **21 more Radiance printings** (17 card faces and 4 alternate-art printings). Together with [wave 1](RADIANCE-WAVE1.md), **54 of 219** Radiance printings are now playable; the rest stay reference-only.

## Rules sources

- [Core Rules](https://playriftbound.com/en-us/rules-hub/) (last updated 9 October 2026), **830. Deploy**: Deploy is short for “This may be played or created to any battlefield,” “Play or create this only to a battlefield,” “If this is not a unit, it is not recalled in cleanups,” and “When an opponent holds here, kill this.” Gear with Deploy can be moved by appropriate effects.
- Core Rules **187.12**: a Bomb gear token is a domainless gear token with “[Deploy]” and “[Deathknell][>] Deal 2 to an enemy unit here and kill all other Bombs you control here.”
- [Radiance core rules patch notes](https://playriftbound.com/en-us/news/announcements/core-rules-radiance-patch-notes-effective-october-16-2026/): Deploy gear can be played to enemy-occupied, friendly or uncontrolled battlefields and stays there until destroyed or moved.

## Engine behavior

- Gear now records `deployedAt` when it is at a battlefield. Unattached gear without it is still in its controller's base, so every existing card keeps its previous behavior. Saved games validate the field.
- A gear whose script has `Deploy` is offered **only** at battlefields, and at every battlefield. Deploying does not contest or control the battlefield, because gear is not a unit.
- When a player holds a battlefield, each opposing Deploy gear there gets a triggered ability that kills it. Conquering does not. The owner's own “when you hold/conquer here” abilities trigger instead.
- “Here” for a deployed gear means its battlefield: its play, death, beginning-phase and end-of-turn triggers and target filters all use that location. A dead Bomb's Deathknell still knows where it died.
- Deploy tokens (Bombs) are created only to battlefields. “Play three Bombs to a single battlefield” asks for one battlefield.
- The table shows deployed gear as chips on its battlefield: the top-left corner on desktop and tablet, and a dedicated row on phones. Identical tokens are grouped (“Bomb ×2”). In the gear row, a flag label names the battlefield.

## Cards

| Card                            | Implementation                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Bomb (token)                    | Deploy; Deathknell: 2 damage to an enemy unit there, then your other Bombs there die (and detonate)    |
| Amateur Demolitionist           | On play: a Bomb to a battlefield                                                                       |
| Banner of Conquest              | Friendly units here have Assault (+1 Might as attackers, per Banner)                                   |
| Hunting Blind                   | On play: you may move an enemy unit here; friendly units here have Shield 2                            |
| Resource Extractor              | End of your turn: an exhausted Gold if you control this battlefield                                    |
| Overloaded Traveler             | +1 Might while a friendly Deploy gear is at its battlefield                                            |
| Pillaged Armory                 | On play and when you conquer here: Buff a friendly unit                                                |
| Portable Portal                 | On play: you may pay Body Power to ready a unit here; friendly units here have Ganking                 |
| Jarvan IV, Martial Paragon (2)  | Your Deploy gear have Action; on conquer, channel 1 exhausted rune if a friendly Deploy gear is here   |
| Explosimian                     | When it holds: three Bombs to a single battlefield                                                     |
| Satchel Charge                  | Action: move a friendly unit, then a Bomb to a battlefield                                             |
| The Good Stuff                  | On play: discard 1, then draw 3; when you hold here, it returns to its owner's hand                    |
| Bushwhack Trap                  | Its controller may hide one more card here while they control the battlefield                          |
| Ziggs, Explosive (2)            | 1 Energy, exhaust: a Bomb; when defending, you may kill a friendly gear for +2 Might                   |
| Concert Poster                  | On play and when you conquer here: you may pay 1 Energy for a Recruit in your base                     |
| Hexplosives Expert (legend, 2)  | 1 Energy + 1 Power, exhaust: a Bomb                                                                    |
| Exemplar of Demacia (legend, 2) | When you deploy a gear, you may exhaust it and pay 1 Power to move a friendly unit to that battlefield |
| Demacian Standard               | When friendly units attack here, one gets +2 Might; when you hold here, you may return it to hand      |

Choices that the printed text resolves on resolution (“you may pay…”, “you may move…”) open a choice when the ability resolves; a chosen unit is still targeted, so Deflect costs apply.

## Not in this wave

Deploy cards that need further engine work stay reference-only: **Detonation Amplifier** (extra Deathknell triggers here), **Blossoming Dreamroot** (“win a combat”, not defined in the current Core Rules text), **Gravity Field** (movement tax), **Dockside Lock-Up** (banish and replay), **The Ball** (gear with Ganking that moves), **Command: Attack** (moving gear and deck search), **Hexplosive Minefield** (delayed Bombs) and **Ziggs, Short-Fused** (bonus damage for gear abilities).

## Bot planning performance

The first full-suite run timed out in one existing simulation, Lux vs Lux (seed 20261002), after 240 seconds. Lux decks contain no Radiance cards. The bot seeds its sampling of hidden opponent cards from a hash of the observed state, which includes the list of supported cards. Adding cards therefore changes which hypothetical hands it imagines. In this position it imagined Bellows Breath, whose Repeat over "up to three units at one location" creates thousands of cost variants. One decision took about 105 seconds. The previous code took 0.4 seconds for the same position, but a different seed gave the same new code 0.25 seconds. The slow path already existed and was exposed, not introduced, by the new cards.

Three changes to legal-action generation remove most of the cost without changing any result:

- Deflect taxes are memoized while one enumeration prices its variants. The memo is active only while the read-only variant generator runs.
- Cost variants (additional costs and Repeat) are generated lazily, in the same order.
- Validating an action whose ID is not a cost variant (for example `pass`) does not enumerate cost variants. Variants are only appended to the list and never change other actions.

The same decision now takes about 9.5 seconds. Three deterministic Lux vs Lux games produced identical move sequences before and after these changes and ran 12–15% faster overall. The remaining cost is pricing every unaffordable variant inside one generator step. Pruning those variants safely would need either a planner change or a target-aware cost bound. Two modules give target-dependent discounts, so a simple cost bound is not safe. That remains separate work.

## Precon progress

| List      | Executable / distinct cards |
| --------- | --------------------------- |
| Seraphine | 10 / 30 (wave 1: 9)         |
| Evelynn   | 15 / 29 (wave 1: 13)        |

## Validation

- `tests/radiance-deploy.test.ts` (26 tests): Deploy play locations, kill on an opponent's hold only, save/validation of `deployedAt`, Bomb creation and chain detonation (damage only to enemies, tokens never in the trash), every card above, and two complete bot-versus-bot games with Ziggs/Hexplosives Expert and Jarvan/Exemplar Deploy decks.
- `tests/deploy-preview.html` is a browser fixture for the battlefield chips. It was checked in Chromium at 1440×900, 1024×768, 844×390 and 390×844 with no page errors or horizontal scrolling. On a 1024×768 table, the chips do not shrink unit cards (43 px, the same as without them).
- Full suite outside the precon matrix: **142 files, 2,732 tests passed**. Precon matrix: **331 tests passed** (111 + 110 + 110). All runs used the CI timeouts and exited 0. See also [VALIDATION.md](VALIDATION.md).
