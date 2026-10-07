# Twelfth-wave additional-cost sources

Checked on 7 October 2026 against the preserved catalog text and current official rules. The image links below identify the official card references supplied by the catalog; this wave does not supplement missing image-only rules panels.

| Card                                                                                                                                                            | Implemented behavior                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Wallop](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/7bbd2eb8ce224e1872a1c920d7c64d796b2355cd-744x1039.png?accountingTag=RB)               | Action: optionally spend a friendly unit's buff to ignore the base cost; ready a unit.                   |
| [Call to Glory](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/ced53bc3fb15f263471067fc3868295b09e62a07-744x1039.png?accountingTag=RB)        | Reaction: the same optional buff payment; give a unit +3 Might this turn.                                |
| [Legion Quartermaster](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/c09cc35ffc98b46f919c09e09a93b603d63eb73e-744x1039.png?accountingTag=RB) | Return a friendly gear to hand as a mandatory additional play cost.                                      |
| [Zaun Punk](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/af4eec8bb065708bf790b940fa065ea3e735afa0-744x1039.png?accountingTag=RB)            | Optionally kill friendly gear as an additional cost; the paid play triggers a chosen gear's destruction. |
| [Sacrifice](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/139153ae4b4f786442018c09765c67e35515df24-744x1039.png?accountingTag=RB)            | Reaction: kill a Mighty friendly unit as a mandatory cost; draw two and channel one exhausted rune.      |

The [Core Rules, 16 July 2026](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf) were confirmed through the [Rules Hub](https://playriftbound.com/en-us/rules-hub/) and extracted locally:

- **203.2–3 / 357.2.a:** replaced cost actions still count as paid; impossible costs cannot be paid.
- **355.10.c:** objects chosen to pay costs are not targets. A buff donor therefore adds no Deflect payment.
- **356.1.b / 356.2 / 356.4.e:** ignoring a base cost preserves additional costs and increases. Optional costs require the controller's choice. A reduction floor does not raise a zero cost.
- **357.1–2:** Energy and Power precede nonstandard payment. Might must be valid when the unit is killed, including changes from rune recycling and Power expenditure.
- **358–359:** legality and payment precede finalization and responses. Payment-trigger choices must not interrupt an unfinished card play.

The [Spiritforged FAQ](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/) additionally confirms that Deflect is a mandatory additional cost. Tests keep those taxes when a buff waives the base cost.

The implementation retains physical cost-source identity separately from effect targets. Returning attached gear removes its attachment, and tokens cease to exist instead of entering hand or trash. Sacrifice uses current Might including Equipment and combat modifiers. Counters and vanished effect targets never refund a successfully paid cost. Unimplemented effect-directed plays remain unavailable.
