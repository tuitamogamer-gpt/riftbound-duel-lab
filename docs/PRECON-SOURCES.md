# Starter preconstructed deck import

Verified 2 October 2026. `src/data/precon-lists.json` imports all **13 released complete starter/preconstructed decks**: four Proving Grounds decks, three Origins Champion Decks, two Spiritforged Champion Decks, two Unleashed Champion Decks, and the Shen/Zed Vendetta Showdown pair. Radiance launches on 23 October and is not included in this snapshot. Seeded Pre-Rift packs are partial card pools, not complete starter decks.

Every entry preserves 40 main-deck cards including its chosen champion, 12 runes, the printed legend, and all supplied battlefields. Proving Grounds provides **one battlefield per deck**; the remaining products provide three. Selecting a different supplied champion would move the current chosen champion into the main deck without changing contents. Bonus booster packs, tokens, and instructional inserts are not main-deck cards.

Sources:

- [Official Origins Deckbuilding Primer](https://playriftbound.com/en-us/news/rules-and-releases/deckbuilding-primer/): the Lee Sin, Jinx, and Viktor lists are embedded decklist images, directly inspected and transcribed.
- [Official Spiritforged lists](https://playriftbound.com/en-us/news/announcements/spiritforged-precons-fiora-rumble/): tabular card names, quantities, and collector numbers for Fiora and Rumble.
- [Official Unleashed lists](https://playriftbound.com/en-us/news/announcements/vi--vex-champion-decks/): Vi and Vex quantities and champion options.
- [Official Vendetta Overview](https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/): Shen and Zed decklists.
- [RiftMana Proving Grounds transcription](https://riftmana.com/riftbound-proving-grounds-decklists/): complete Annie, Lux, Garen, and Master Yi contents. This is a community transcription; a complete Riot-hosted list was not located. The [official product sheet](https://uvsgames.com/wp-content/uploads/2025/09/Riftbound_Sell_Sheets_Final_5-20.pdf) confirms the product and its four champions.
- [Official release roadmap](https://playriftbound.com/en-us/news/announcements/august-2026-roadmap/): release cutoff used for Radiance.

## Data reconciliation

The Unleashed article misspells `Evelynn` as `Evelyn`, `Carrion Dredger` as `Carion Dredger`, and adds punctuation to `Mageseeker Investigator`. The import resolves these to the catalog's final card names. The Vendetta article calls VEN-096 `Shadowcloaked Assassin`; the final catalog and [retail deck transcription](https://riftmana.com/preconstructed-vendetta-champion-starter-decks-riftbound-tcg/) identify it as `Shadowblade Lurker`. Those resolutions are also recorded per deck.

Several Vendetta printings are duplicated by the upstream provider, with matching image and rules text but distinct provider IDs. The import selects a single base-art printing, retaining the repository's full unique `id`; cards are not dropped or replaced because of the duplicate.

These historical retail lists preserve cards affected by later constructed-play bans. Importing them for local preconstructed play does not make them current tournament lists. Structural validity, current tournament legality, and executable rules coverage are separate checks.

## Equipment data correction

Riftcodex's text omits the lower equipment ability panel and Might bonus on these Spiritforged cards. The actual Riot CDN card images were inspected:

| Card                    | Printed equipment bonus | Additional ability granted to equipped unit |
| ----------------------- | ----------------------- | ------------------------------------------- |
| Doran's Blade, SFD-095  | +2 Might                | None                                        |
| B.F. Sword, SFD-161     | +3 Might                | None                                        |
| Long Sword, SFD-022     | +2 Might                | None                                        |
| Warmog's Armor, SFD-108 | +1 Might                | When it conquers, buff it                   |
| Sacred Shears, SFD-172  | +1 Might                | Deathknell: draw 1                          |

The explicit equipment scripts preserve those printed effects. Source images are available in each card's `image` field in `src/data/cards.json`; provider text alone is not a sufficient equipment-rules source.

## Spiritforged rules verification

The [official Spiritforged FAQ](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/) supplies Yone's functional erratum: its conquer trigger checks whether the battlefield was uncontrolled before conquest, including surprise defense. The engine follows that erratum rather than the older catalog text saying “open.” Weaponmaster remains optional.

The [16 July 2026 Core Rules](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf) were checked for the following engine behavior:

- Rule 432: doubling Might adds the current value when the effect resolves; Fiora's bonus lasts only for that combat.
- Rules 809.1.c and 809.2: Deflect is paid for each target selection, and multiple Deflect grants add together.
- Rule 817.2: multiple Vision instances trigger separately, including multiple Forecasters.
- Rule 820.2: Repeat's targets are chosen before responses; each execution may select a different target.
- Rules 431.1.b and 440.4: Minefield's deck-to-trash effect burns cards, invokes Burn Out if necessary, then finishes the remaining amount. It does not draw cards.
- Rules 356.4.f.1 and 821: Weaponmaster discounts Power, while other equip costs remain payable; Hextech Gauntlets retains any Energy cost after its Might discount.

The [14 August Vendetta FAQ](https://playriftbound.com/en-us/news/rules-and-releases/vendetta-rules-faq-and-clarifications/) takes precedence where it differs from that Core Rules edition. The scripts also use its clarification that a countered Flow spell goes to banishment.
