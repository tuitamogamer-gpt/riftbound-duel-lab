# Exhausted status token

This records the earlier gold medallion iteration. The active interface now uses the [black-and-red comic token](EXHAUSTED-COMIC-TOKEN.md), selected by the user from the Marvel-style references.

Original UI artwork generated on 2 October 2026 with the built-in imagegen tool, using a transparent background. No external reference image or CLI fallback was used.

- Use case: `stylized-concept`.
- Runtime asset: `public/art/tokens/exhausted.png`.
- Delivered image: 1254 × 1254 PNG, alpha channel preserved, 2,888,704 bytes. The original generated pixels are bundled locally.
- A bronze and gold hourglass medallion with navy enamel and amber sand matches the existing dark game interface.
- The generated image intentionally has no lettering. The interface supplies crisp `EXHAUSTED` lettering and a localized accessible label. Small rune markers use the medallion alone alongside the existing localized readiness label.
- The token is derived directly from each visible card instance's readiness. It disappears on readying, and follows the displayed review frame. No separate status is persisted.
- Final placement: a low navy-and-gold status plaque sits along the lower edge of the card, with a small medallion beside the EXHAUSTED label. Exhausted card and rune art remains fully grayscale and darkened. Unit plaques clear the separate Might badge; runes use a 20px medallion near the bottom of their artwork. Enlarged previews keep the plaque above the set footer. Combat hit/defeat animations preserve token color and brightness.

## Premium token references

Product photography for [Burger Tokens Ready / Exhausted](https://burgertokens.com/products/ready-exhaust-tokens) and [BuyTheSameToken Marvel Champions Ready/Exhausted](https://buythesametoken.com/products/5-x-ready-exhausted-tokens-double-sided-for-marvel-champions-lcg) was inspected on 2 October 2026. The former uses small discs and contrasting status symbols; the latter uses small dark acrylic markers with a strong colored label. The UI adaptation uses compact proportions, a defined edge, restrained depth, and readable status lettering. These are design references only; no third-party artwork is bundled or copied. The original imagegen medallion is retained as the small icon.

## Verification

The desktop and 390px mobile layouts were inspected in a separate browser test origin. The exhausted Recruit, Viktor Legend, and Mind Rune each display the medallion, while the ready Order Rune, available champion, and hand cards have none. The Legend's enlarged preview also shows the token. There is no horizontal page overflow at 390px. The Hero/Legend pair remains to the right of the hand and rune cards remain below it.

- [Final desktop screenshot with lower-edge tokens](screenshots/exhausted-tokens-bottom.jpg)
- [Final mobile screenshot with lower-edge tokens](screenshots/exhausted-tokens-bottom-mobile.jpg)
- Final placement checked at desktop and 390px: Legend plaque heights are about 26px and 17px respectively; unit plaques are 16px high, entirely in the lower half and clear of the Might badge. Labels fit inside the marker, rune art remains visible, and the enlarged preview places its plaque above the set footer. Computed art filters remain `grayscale(1) brightness(0.62)`. No horizontal page overflow appears. The production build passed again.
- 86 targeted tests passed across exhaustion, gear/preview surfaces, Legend setup, champion zones, combat, and translations. Coverage includes exhausted-to-ready rendering, unaffordable-card exclusions, both players, and equipment exhaustion at the activation frame before resolution.
- Production build passed. The existing large-bundle warning remains. Browser warning/error log was empty.

## Final generation prompt

Create ONE premium physical status token asset for a dark fantasy collectible card game UI. A single round arcane medallion viewed exactly front-on, perfectly circular, centered, isolated on a fully transparent background. The medallion should fill about 90% of a square canvas, with a small clear margin. This token means EXHAUSTED: its central symbol is a bold, instantly recognizable hourglass with almost all its amber sand resting in the lower half, a narrow dark upper chamber, and a subtle ember glow. The hourglass silhouette must stay extremely readable when the entire token is displayed at 28 pixels. Surround it with a substantial sculpted aged-bronze and champagne-gold double bevel rim, restrained engraved radial marks, and midnight navy obsidian enamel. Two tiny luminous amber gems at 3 and 9 o'clock; a small inverted triangle inset at 6 o'clock. Expensive tangible cast metal, fine restrained wear, exquisite relief, realistic controlled studio lighting from upper left, warm amber highlights, cool navy shadows, strong clean silhouette, high contrast, rich material detail. This should look like a luxurious tabletop gaming accessory and fit a polished navy/teal/gold interface. Design hierarchy: very large simple hourglass symbol, thick simple rim, minimal ornament. Do not use any letters, numbers, text, lettering, wordmarks, logos, extra tokens, cards, hands, table, scenery, mockup, border outside the object, or background. No perspective tilt. No external glow haze. Keep all shadow and detail within the medallion silhouette. True transparent alpha cutout outside the medallion.
