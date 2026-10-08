# Riftbound significant event motion

## Style Prompt

A restrained tactical accent inside the existing Riftbound navy card table. Brass signals conquest, teal marks your public actions, rose belongs to the opponent, and violet marks a successful counter. A compact ring resolves into a readable seal, then disappears. The surrounding battlefield art, score, Might and player controls remain visible and usable. The source of this identity is `src/match-skin.css` and the current desktop/mobile screenshots in `docs/screenshots/visual-polish-*`.

## Colors

- `#050b11`: deepest table ink.
- `#0f1f2b`: raised navy panels.
- `#e9c97b`: brass conquest and combat impact accent.
- `#5ad8c6`: teal player action accent.
- `#c7a8ff`: violet successful counter accent.
- `#eff4f6`: readable foreground, existing table text.

## Typography

- Exo 2, italic 800: event names, matching the actual game display type.
- DM Sans, 500/700: metadata, matching the actual game labels.

## Motion Rules

- A finite 1.25 second sequence; no looping, screen shake, or full-table wash.
- The live game decal is at most 80 by 80 CSS pixels. This authoring composition enlarges that same decal for review.
- Entrance begins at 0.1 seconds, varied easing keeps ring, seal and rays distinct.
- Reduced motion shows a static seal. Paused playback retains a readable hero frame.
- Animate only opacity and transforms on dedicated decorative children; never animate a card, a score, Might, or a button.
- No private card names, labels, game state or randomness is embedded in the motion source.

## What NOT to Do

- No animation for routine draw, rune/channel updates or phase changes.
- No paid assets, invented fonts, replacement branding or external media dependencies.
- No blocking overlay, flashing, infinite particles, screen shake or high contrast strobe.
- No animation ownership shared with Remotion or CSS on the same decorative elements.
- No effect on gameplay timing, rules, targets, scoring or decision availability.
