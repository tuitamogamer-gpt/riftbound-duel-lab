# Comic-style exhausted marker

Historical horizontal version, superseded by the [small square token](EXHAUSTED-SQUARE-TOKEN.md) at the user's request.

Generated with the built-in imagegen tool on 2 October 2026. This replaces the gold hourglass treatment in the active interface, following the user's selection of the Marvel Champions accessory style previously reviewed.

- Runtime asset: `public/art/tokens/exhausted-comic.png`.
- Image: 2172 × 724 PNG, true alpha preserved, 1,419,093 bytes. The generated pixels are bundled locally without modification.
- Reference: [BuyTheSameToken Ready/Exhausted tokens for Marvel Champions](https://buythesametoken.com/products/5-x-ready-exhausted-tokens-double-sided-for-marvel-champions-lcg). The product photograph was used as a visual style reference for black acrylic, red-orange comic rays, and a defined edge.
- The new original marker has a low horizontal shape to fit the lower part of the card. The interface overlays EXHAUSTED as live text for small-size clarity and retains a localized accessible status.
- Card and rune artwork remains fully grayscale while exhausted. The marker follows current readiness and the visible Proceed frame, with no separate persisted state.

## Verification

- 32 existing exhaustion, live-surface, and champion-zone tests passed with the new asset and label on compact markers. Production build passed with the existing large-bundle warning.
- Desktop and 390px mobile checks confirmed loaded local art, labels inside markers, no overlap with the Might badge, and all tokens in the lower half of their cards. Mobile sizes: unit 39 × 13px, rune 34 × 12px, Legend 52 × 15.75px. No horizontal overflow or browser warnings/errors were captured.
- Exhausted artwork still computes to `grayscale(1) brightness(0.62)`; ready cards remain unmarked.
- [Desktop screenshot](screenshots/exhausted-comic-tokens.jpg) · [Mobile screenshot](screenshots/exhausted-comic-tokens-mobile.jpg).

## Final generation prompt

Use case: stylized-concept. Asset type: a single premium comic-book card-game EXHAUSTED status token for a digital card game.
Use the attached product photo as a STYLE REFERENCE: take the visual language of the RED exhausted acrylic counters (jet-black face, vivid vermilion orange-red engraving, comic impact rays, crisp cut edge). Produce a fresh standalone single marker, not a photo of the reference items.
Composition: exactly straight-on orthographic view of ONE very low, wide rectangular acrylic marker, width-to-height ratio 3.4:1, with subtly chamfered corners and a slim black beveled edge. A wide canvas about 1536x452, with the token filling almost the whole width and height and only a tiny transparent margin. True transparent background outside the marker. Never a square coin or gold medallion.
Design: opaque jet-black face, narrow bright red-orange inset outline. Sharp irregular red-orange comic burst lines flare inward from the outer edges, while the central 75% width x 65% height remains clean jet black for a separate readable EXHAUSTED text overlay in the app. Strong simple shapes that survive at 48x16 pixels. The face should feel like real premium laser-engraved black cast acrylic with fluorescent red paint, restrained edge highlights and subtle physical depth. Bold, graphic and legible. Avoid gold, brass, bronze, hourglass icons, ornamental fantasy engravings, gradients filling the central label area, sparks, excess lighting and glow.
NO TEXT OR LETTERS: the app will render the EXHAUSTED word sharply over the black center. No branding, logos, Marvel text, characters, multiple tokens, scenery, surface, hands, green ready token, photographs of cards, surrounding shadows or mockup. Output only the isolated red/black horizontal token on transparency.
