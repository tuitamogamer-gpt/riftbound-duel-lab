# Riftbound rules research

Verified on 2026-10-02. This is an implementation brief, not a reproduction of the rulebook. The current official core rules are dated **2026-07-16**; the later **2026-08-14 Vendetta FAQ** prevails where it explicitly corrects them. The Rules Hub lists constructed bans updated **2026-09-18**. A complete implementation must treat card text, official errata, and current FAQ rulings as authoritative over ordinary rules.

## Sixth-wave implementation checks — 4 October 2026

The [official Core Rules PDF](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf) and the official [Origins](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-origins-faq/), [Spiritforged](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/) and [Vendetta](https://playriftbound.com/en-us/news/rules-and-releases/vendetta-rules-faq-and-clarifications/) FAQs were consulted alongside preserved catalog text.

- **185 / restrictions:** tokens are not cards. Brynhir prohibits opposing card plays for the turn but permits tokens and abilities; Rockfall Path prohibits all unit plays there, including tokens, while movement remains permitted. Ol' Poro counts its controller's own turns.
- **355.4 / 355.11–13:** destinations and all initial targets are declared before reactions. Optional target counts include zero. If Bellows Breath's original targets no longer share a location, its controller selects a legal subset from those same targets; no new targets or additional Deflect payments are introduced. Saved mid-resolution choices restore correctly.
- **356.1–4:** Hidden ignores base cost only; additional costs and increases still apply. General discounts follow additional costs and increases and may reduce Deflect/Repeat costs. Marai's component discount applies to Repeat before general discounts. Each one-Energy minimum applies to that discount; an unrestricted discount can then lower the cost further. Universal discounts retain a payable allocation across colored and universal Power groups.
- **359.3:** relative references use the live source. Blitzcrank requires its current battlefield for the pull; Imposing Challenger rechecks its Might and location before moving the enemy. Declared targets that become illegal are skipped without substituting new ones.
- **Simultaneous damage:** Stormbringer and Bellows apply one damage event to their affected group before death checks. Karthus's extra Deathknell occurrence is captured before simultaneously dying units leave.

All 29 newly implemented faces have focused engine coverage. Full multiple-instance Repeat and public-trash object identities are not claimed as implemented.

## Fifth-wave checks — 4 October 2026

- [Spiritforged FAQ](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/): Falling Star declares both choices before responses, including separate Deflect payments if the same unit is chosen twice. Janna heals friendly units here and may move up to one enemy; an absent enemy does not prevent healing.
- [Core Rules](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf), 821.1: Weaponmaster chooses Equipment before responses. The discounted Equip payment happens as the trigger resolves; destroyed Equipment cannot be replaced with a new target. It does not activate Equip or target the receiving unit.
- Core 417.6: damage explicitly dealt by a unit, including Last Breath and Strike Down, is unit damage. Unyielding Spirit's spell/ability protection and spell damage bonuses do not modify that source.
- Core 433/437: swaps use the raw Might difference, including negative values; combat cannot allocate lethal damage to a fully protected unit. Core 811.1.d.2.a restricts only Smoke and Mirrors' first target to the Hidden battlefield.
- [Piltover Archive's published codec](https://github.com/Piltover-Archive/RiftboundDeckCodes), package `@piltoverarchive/riftbound-deck-codes` 1.5.0: deck-code versions, chosen champion, sideboard, signed and R/SP numbering. This is a community interchange format, separate from Riot rules. The app bounds and validates packets before calling the decoder.

## Primary sources

- [Official Rules Hub](https://playriftbound.com/en-us/rules-hub/)
- [Core Rules, 2026-07-16, official PDF](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf)
- [Official quick-start article](https://playriftbound.com/en-us/news/rules-and-releases/how-to-play-get-started/)
- [Quick-start booklet, official PDF](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/3694623875b098a3d0daed824e242b3a0e68dae6.pdf)
- [Deckbuilding primer and original champion deck lists](https://playriftbound.com/en-us/news/rules-and-releases/deckbuilding-primer/)
- [Vendetta FAQ, 2026-08-14](https://playriftbound.com/en-us/news/rules-and-releases/vendetta-rules-faq-and-clarifications/)
- [Origins card errata, 2025-10-28](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-origins-card-errata/)
- [Spiritforged errata, 2026-01-14](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-errata/)
- [Spiritforged FAQ, 2026-01-14](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/)
- [Unleashed errata, 2026-04-03](https://playriftbound.com/en-us/news/rules-and-releases/unleashed-errata-updates/)

Rule numbers below refer to the July 16 core PDF. The complete PDF was downloaded and its text inspected during research. The short learning booklet omits important details and sometimes reflects an earlier rules version; prefer the numbered core rules.

## Fourth-wave errata verification — 2 October 2026

Provider records can retain old text. This wave preserves those records for source integrity and implements the current official corrections, with a visible note in card inspection:

- **Deathgrip:** declare both friendly targets before responses. Killing is an instruction on resolution, not an upfront cost; only an actual kill supplies the Might increase. Draw remains an independent instruction.
- **Guards!:** token creation is followed by a separate optional reflexive trigger. Its Order cost is paid before opponents receive the trigger's response window. From Hidden, the token appears at that battlefield.
- **Tideturner:** the chosen controlled unit must be at a different location, checked both on declaration and on resolution. Hidden local targeting does not override its explicit other-location requirement (811.1.d.2).
- **Tianna Crownguard:** opponents cannot gain points while she occupies a battlefield, including burnout and ability points. Conquer/hold events still occur; final-point replacement can still cause a draw.
- **Rengar, Trophy Hunter:** Ambush also permits enemy-occupied battlefields without a friendly unit there.

The Vendetta FAQ also confirms that Akali's already-triggered effect retains the captured movement locations after she leaves, and that Defender of Tomorrow retains its original ability while gaining the Empowered one. Copied dependent abilities check the new source's Empowered state. Patched Porobot's hybrid Unit/Gear type remains unsupported and is explicitly blocked in the registry, including equivalent printings.

Rules 143.2.b.1 and 432.1 require raw Might arithmetic for increase/doubling before the zero floor. Passive played-spell conditions count finalized spells even if countered (419.4.b); resolved-play triggers remain separate. These cases have focused regression tests in the wave4 suites and the Dame regression in `vendetta-wave3.test.ts`.

## Duel setup and deck validation

- **103:** one champion legend defines permitted domains; a multicolor card requires all of its domains to be permitted. Main deck has at least 40 cards, including the chosen champion. Maximum three copies of each full card name. Signature cards are restricted to the legend's champion tag, and the **sum of all signature cards is at most three**, even across different names. Unique cards have a one-copy limit (825).
- **103.2 / 108.3:** chosen champion is a champion unit with the legend's champion tag. It is removed from the main deck during setup into its own public zone. It can be played from there for its regular cost. It goes to trash on death; it does **not** return automatically to that zone. Additional copies of the same full card name also count as chosen-champion cards for effects.
- **103.3:** exactly 12 runes, matching legend domains, in a separately shuffled deck. No starting runes are on the board. A 6/6 split is the official suggested starting point for two-domain decks.
- **103.4 / 485:** each player supplies three differently named battlefields. Duel randomly selects one of each player's three; the two selected battlefields enter simultaneously. The rest are out of this game. Battlefield ownership does not restrict who can capture it.
- **110–118:** determine a fair random first player, shuffle the 39 remaining main cards and 12 runes separately, and draw four. Each player gets one optional mulligan of up to two cards, in turn order. **Set cards aside, draw replacements, then recycle the set-aside cards**. Multiple cards recycled to main deck are randomized on its bottom (416.5).
- **485:** two players, two battlefields, first to eight points wins one duel. The second player channels one extra rune on their first channel phase. **Both players draw on their first turn in Duel.** The skip-first-draw rule belongs to other multiplayer modes.

## Turn sequence

**315–317**, in this order:

1. Awaken: ready all of the active player's eligible objects, including units, gear, runes, and legend.
2. Beginning: resolve beginning triggers; then hold and score controlled battlefields. Temporary units die from a beginning trigger **before** holding.
3. Channel: put the top two runes into play ready; the second player puts three on their first turn. If fewer remain, channel as many as possible.
4. Draw: draw one. There is no maximum hand size.
5. Main: clear both players' unspent resource pools, process main-phase triggers, then allow legal discretionary actions in any order and any number of times. Card plays, activated abilities, and standard moves are the ordinary actions.
6. Ending: process end triggers; heal all units; expire turn-duration effects; clear both resource pools. Resolve resulting triggers/cleanups before advancing.

Runes remain exhausted through the opponent's turn. This means leaving ready runes is strategically relevant to interaction. A ready unit may defend even if it is exhausted; exhaustion is a cost of movement or an indicated ability, not a prohibition on fighting.

## Resource payment and card entry

- **163–167:** exhausting a basic rune adds one domainless energy. Recycling it adds one power matching that rune's domain. Universal power can satisfy any domain. Costs with an any-domain power symbol accept any power. A rune already exhausted for energy may also be recycled for power during the same payment.
- Resource generation is an immediate Add ability; opponents cannot react between generation and spending it. The conceptual resource pool can hold floating resources until the start of main or end of turn.
- **143.4 / 149:** units enter exhausted unless text or a paid Accelerate cost changes this; gear enter ready. Units can normally enter only the player's own base or a battlefield they currently control. Gear normally enter the base.
- Ordinary card plays and activations happen only in the active player's neutral, open main phase. Units and gear finalize and enter immediately; spells and non-Add abilities resolve via the chain. Their play-trigger abilities create their own chain items.
- Target choices and costs must be legal when an item is finalized. Recheck targets on resolution. Follow feasible instructions; do not improvise effects when text is unsupported.

## Movement, control, and the important empty-field response window

- **144:** a ready unit can exhaust for a standard move during its controller's neutral, open main phase. Legal standard routes are own base to any battlefield, or battlefield to own base. Ganking adds battlefield-to-battlefield routes.
- Multiple units may move together as one action to the **same destination**; their origins can differ. All movement costs are paid simultaneously. Card-directed moves can move exhausted units and can use different routes if allowed by their text.
- **188–190 / 344–348:** entry by a player who does not control a battlefield contests it. Even entry into an empty battlefield starts a **non-combat showdown** before control and points are awarded. This is an interaction window; do not immediately score an empty-field move.
- The contesting player begins with Focus. If an enemy unit enters during that showdown, it becomes a combat showdown. When a non-combat showdown closes, a sole remaining player's units establish control, potentially scoring a conquer.
- Control requires an occupying friendly unit. Outside an ongoing showdown/combat, an empty controlled battlefield loses control at cleanup. During combat, its prior controller retains control until the resolution step changes it.
- A player's base cannot be attacked by ordinary movement. Battlefield capacity and base capacity are not limited by a fixed number of card slots.

## Priority, Focus, chain, and combat

**307–313 / 327–348:** distinguish the active turn player, current chain Priority, and current showdown Focus.

- Neutral + open: active player can make ordinary plays.
- Showdown + open: player with Focus can play Action or Reaction cards/abilities, or pass.
- Any closed state (chain nonempty): only Reaction cards/abilities may be added by the player with Priority.
- After an item is finalized, its controller has Priority. Consecutive passes by both players resolve the most recently finalized item. Repeat priority handling after each resolution; use last-in-first-out ordering.
- When the entire chain initiated by a discretionary Action/Reaction finishes during showdown, Focus passes to the other player. A chain started by triggered/resource abilities does **not** cause that Focus pass. Reacting does not make that reacting player the original Focus owner.
- Two consecutive Focus passes with no new action close the showdown. Ordinary standard movement cannot be used inside showdown.

**459–466** combat procedure:

1. Stage combat when enemy units share a battlefield and the existing chain permits proceeding. If several battlefields stage combat, the active player selects the order.
2. Establish attacker (the player who contested) and defender. The attacker initially has Focus. Put attack triggers on the chain, then defense triggers; consequently defense triggers generally resolve first. Resolve start/attack/defend triggers and allow legal reactions.
3. Play the showdown to completion.
4. If both armies remain, total each side's current Might, excluding stunned units' contribution. Assign damage starting with the attacker. Both sides' damage is then dealt simultaneously.
5. Lethal damage must be assigned to a unit before assigning to another; do not overassign while another valid unit remains. Existing marked damage reduces the remaining lethal requirement. Tank units are assigned first, Backline last. The assigning player chooses among equally prioritized targets. Damage prevention/replacement is considered when determining lethal assignment.
6. Kill lethally damaged units. Heal **all** surviving units at all locations. If defenders remain, recall surviving attackers to base. Recall itself does not ready or exhaust a unit.
7. Resolve death, combat-result, and relevant cleanup triggers. Determine control: attacker alone takes it; defender retains it; nobody remaining means uncontrolled. Remove hidden cards whose owner no longer controls the battlefield. Award conquer if eligible.
8. Remove combat designations and expire combat-duration effects.

Damage does not reduce Might. A damaged 6-Might unit still contributes six combat damage. A unit reduced to zero Might is not automatically killed merely by having zero damage; lethal damage is nonzero damage at least its Might. Assault and Shield modify Might while attacker/defender designations apply; these values therefore affect both combat damage contribution and lethal thresholds during combat.

## Scoring, victory, and deck exhaustion

- **467–472:** each player can score a particular battlefield only **once during a given turn**, whether through hold or conquer. Track scored battlefields per player per turn, including points earned during an opponent's turn. Recapturing a field that player already scored that turn gives no second conquer score.
- A hold at beginning scores one. A new eligible conquest scores one.
- If conquest would award the eighth (or later) point, it succeeds only after that player has scored **every battlefield during this turn**. Otherwise draw one instead. Mark the conquest as scored even when the point is replaced with a draw; its conquer triggers still happen.
- A hold, burnout point, or other non-conquer point is not subject to that winning-conquer restriction. At cleanup, a player with at least eight and more points than the opponent wins.
- **431:** drawing/milling beyond the main deck invokes Burn Out, not immediate loss: perform available draws/mills, recycle the entire trash in random order into main deck, award the opponent one point, then finish the remaining draw/mill.
- If both deck and trash are empty, repeated burnout eventually awards enough points for the opponent to win. Later points in that repeated sequence cannot be prevented/replaced. Looking/predicting past the remaining deck does not itself burn out.

## Common keywords and persistent state

| Mechanic                      | Required behavior                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buff (701–705)                | Persistent +1 Might counter; at most one per unit by default; remove on leaving board. A unit's specific text can allow more.                                                                                                                                                                                                                                          |
| Accelerate (805)              | Optional additional energy 1 plus appropriate power as card is played; changes entry to ready. Later FAQ should determine special multicolor cases.                                                                                                                                                                                                                    |
| Action (806)                  | Adds permission to play during any player's showdown, with Focus and an open chain.                                                                                                                                                                                                                                                                                    |
| Assault X (807)               | Add X Might while attacking; omitted X means 1; multiple grants add.                                                                                                                                                                                                                                                                                                   |
| Deathknell (808)              | Trigger when killed and actually sent to trash; retain last location/attributes to resolve. A replacement that prevents death prevents this trigger.                                                                                                                                                                                                                   |
| Deflect X (809)               | Enemy targeted spells/abilities cost X extra any-domain power for each time they target this object. Omitted X is 1.                                                                                                                                                                                                                                                   |
| Ganking (810)                 | Standard move may go from battlefield to battlefield; still exhausts.                                                                                                                                                                                                                                                                                                  |
| Hidden (811)                  | On own open turn, pay one any-domain power to hide in a controlled field's empty hidden slot. Hiding is not playing and opens no chain. **Cannot be played from hidden until a subsequent turn.** Thereafter gains Reaction and ignores base cost. Targets and entry locations are restricted to that battlefield where applicable. Loss of control sends it to trash. |
| Legion (812)                  | Dependent ability becomes active after its controller finalized a different main-deck card this turn.                                                                                                                                                                                                                                                                  |
| Reaction (813)                | Includes Action permission and may also be played on a closed chain with Priority. It does not allow unsolicited plays during the opponent's neutral open main phase.                                                                                                                                                                                                  |
| Shield X (814)                | Add X Might while defending; omitted X is 1; multiple grants add.                                                                                                                                                                                                                                                                                                      |
| Tank (815)                    | Must receive lethal combat assignment before non-Tanks.                                                                                                                                                                                                                                                                                                                |
| Temporary (816)               | Dies during controller's next beginning step before hold scoring.                                                                                                                                                                                                                                                                                                      |
| Vision (817) / Predict (436)  | On play, inspect top card, optionally recycle it. Multiple Vision triggers are separate.                                                                                                                                                                                                                                                                               |
| Stun (423)                    | Stops the unit contributing combat damage for this turn; it can still absorb damage and hold/capture.                                                                                                                                                                                                                                                                  |
| Mighty (706–711)              | Current Might at least 5 on board; printed Might off board. Becoming Mighty is a threshold-crossing event.                                                                                                                                                                                                                                                             |
| Equip / Quick-Draw (818–819)  | Equip pays an activation to attach equipment. Quick-Draw gives Reaction and a play trigger that attaches it.                                                                                                                                                                                                                                                           |
| Repeat (820)                  | Pay optional cost once per instance while finalizing; execute instructions again, using choices fixed during finalization.                                                                                                                                                                                                                                             |
| Ambush (822)                  | May play at a field with your units, with Reaction timing for that destination, even if you do not control it.                                                                                                                                                                                                                                                         |
| Hunt / Level (823–824)        | Hunt earns XP on hold/conquer. Level enables text at an XP threshold.                                                                                                                                                                                                                                                                                                  |
| Backline (826)                | Receives lethal combat assignment after non-Backline units.                                                                                                                                                                                                                                                                                                            |
| Empower / Empowered (827–828) | Paid status change enables dependent text.                                                                                                                                                                                                                                                                                                                             |
| Flow (829)                    | Alternate-cost play from trash, ordinary timing still applies, then banish when leaving chain unless its own execution moved it.                                                                                                                                                                                                                                       |

## Official original champion deck lists

These are the lists pictured in Riot's July 2025 deckbuilding primer. They are useful fixed-deck targets, but are **historical preconstructed lists**, not a claim of current competitive legality. Main entries below total 39 plus the chosen champion = 40.

### Lee Sin

[Official list image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/1cb25288620afa5adfba6d9f744b2f4d43aa437f-1920x1080.jpg)

Legend: Blind Monk. Chosen champion: Lee Sin, Centered. Runes: six Calm, six Body. Battlefields: Monastery of Hirana; Targon's Peak; Grove of the God-Willow.

Main: 3 Stalwart Poro; 3 Pit Rookie; 3 Wielder of Water; 3 First Mate; 2 Charm; 3 Challenge; 2 Stand United; 2 Pakaa Cub; 2 Bilgewater Bully; 2 Stormclaw Ursine; 3 Discipline; 3 Wildclaw Shaman; 1 Mask of Foresight; 2 Mountain Drake; 3 Wizened Elder; 1 Mistfall; 1 Udyr, Wildman.

### Jinx

[Official list image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/2444839a08d15447c1c2bb99c194324f7f3fb1cb-1920x1080.jpg)

Legend: Loose Cannon. Chosen champion: Jinx, Demolitionist. Runes: six Fury, six Chaos. Battlefields: Targon's Peak; Zaun Warrens; Reaver's Row.

Main: 3 Flame Chompers; 2 Blazing Scorcher; 3 Fight or Flight; 2 Get Excited!; 3 Gust; 2 Cemetery Attendant; 2 Undercover Agent; 3 Chemtech Enforcer; 3 Brazen Buccaneer; 1 Magma Wurm; 2 Void Seeker; 2 Fading Memories; 3 Traveling Merchant; 3 Scrapheap; 3 Raging Soul; 1 Vi, Destructive; 1 Rhasa the Sunderer.

### Viktor

[Official list image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/1b8f697c883b32c2a6cb0a3b04bf3905c69b51e7-1920x1080.jpg)

Legend: Herald of the Arcane. Chosen champion: Viktor, Innovator. Runes: six Mind, six Order. Battlefields: Trifarian War Camp; The Grand Plaza; Altar to Unity.

Main: 2 Orb of Regret; 3 Cull the Weak; 2 Hidden Blade; 2 Consult the Past; 2 Smoke Screen; 2 Back to Back; 2 Sprite Call; 3 Soaring Scout; 2 Stupefy; 3 Eager Apprentice; 3 Cruel Patron; 2 Jeweled Colossus; 2 Mushroom Pouch; 3 Ravenbloom Student; 3 Noxian Drummer; 1 Wraith of Echoes; 1 Grand Stratagem; 1 Heimerdinger, Inventor.

## Current constructed bans and implementation boundaries

Rules Hub, updated 2026-09-18, bans these cards in sanctioned constructed: Called Shot; Ekko, Recurrent; Draven, Vanquisher; Fight or Flight; Scrapheap; Stealthy Pursuer; Stacked Deck. Banned battlefields: The Arena's Greatest; Aspirant's Climb; Dreaming Tree; Obelisk of Power; Reaver's Row. A casual historical-deck simulator can retain historical lists if it explicitly identifies that format; do not label those lists current Standard legal.

This research establishes rules, not implemented coverage. The app must report its actual scripted card/keyword support. A card catalog containing every card is different from every card being playable with its complete effects. Especially significant remaining engineering work for broad coverage includes: triggered-ability choices/ordering; replacement-effect layering; temporary control; equipment attachment; hidden cards; counters; modal choices; split targets; copy/transform; XP/Level/Hunt; empower and flow; current card errata; battlefield-specific abilities; and interaction with newly released sets.

Avoid generic text parsing that silently treats unknown effects as blank cards. If a fixed scripted pool is used, validate every selected card against that pool, present that scope clearly, and keep unsupported catalog cards out of playable decks until implemented.
