# Square exhausted token

Generated with the built-in imagegen tool on 2 October 2026.

- Runtime asset: `public/art/tokens/exhausted-square.png`, 1254 × 1254 original generated PNG with its alpha preserved. CSS compensates for transparent margins without changing the image's aspect ratio.
- Reference: [BuyTheSameToken Ready/Exhausted tokens for Marvel Champions](https://buythesametoken.com/products/5-x-ready-exhausted-tokens-double-sided-for-marvel-champions-lcg).
- Small square black acrylic marker with red-orange comic rays. The interface overlays diagonal EXHAUSTED text and provides a localized accessible status.
- Placement: lower-right part of each card, above the Might badge or printed footer where present. The marker stays colored while exhausted artwork remains grayscale. Readiness and review-frame behavior are unchanged.

## Verification

- All 32 existing exhaustion, live-surface, and champion-zone tests passed. Production build passed with the existing large-bundle warning.
- Desktop and 390px mobile checks confirmed the square markers, loaded local artwork, full grayscale on exhausted cards, no Might overlap, and no horizontal overflow. Desktop sizes are 20px for units/runes and 28px for Legend; mobile unit18px and Legend22px. The enlarged preview uses42px.
- Live diagonal labels fit within their markers. Ready cards remain unmarked. Browser warnings/errors were empty after reloading the completed asset.
- [Desktop screenshot](screenshots/exhausted-square-tokens.jpg) · [Mobile screenshot](screenshots/exhausted-square-tokens-mobile.jpg) · [Enlarged preview](screenshots/exhausted-square-preview.jpg).

## Final generation prompt

Use case: product-mockup
Asset type: transparent square exhaustion status token for a digital card game, shown at 20-42 pixels.
Input image 1 is a STYLE REFERENCE for the red exhausted square acrylic markers only.
Primary request: create ONE square black acrylic gaming token matching the red comic-burst marker's visual design. Exactly square 1:1 silhouette, front-on orthographic, edges parallel to image edges, no perspective, no rotation. Thick premium matte black acrylic slab, very subtle bevel. Fine vivid red-orange inset square border and bold sharp red-orange comic rays radiating inward from perimeter. Black diagonal stripe from lower-left to upper-right at 45 degrees reserved for live UI lettering.
Composition: token occupies 96% of square canvas, tiny transparent margin, isolated transparent background. No cast shadow beyond a tiny contact rim.
Text: NO text, NO letters. We will overlay EXHAUSTED in the app on the diagonal black central stripe, which needs to be wide enough for a bold single word.
Constraints: square like reference, black and red-orange only, punchy readable burst at tiny sizes, crisp professional acrylic tabletop token, no gold, no hourglass, no circle, no horizontal banner, no long rectangle, no scene or other objects.
