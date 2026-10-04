# Desktop table verification — 4 October 2026

The desktop layout uses a left rail for both players' public setup cards,
adjacent bases and battlefields, and a wide hand along the bottom. Opponent
hand counts and runes sit above the opponent base. The central action chain
keeps its own lane. The compact layout remains below 1100 × 650.

The reference was the desktop game on [mtgpod.xyz](https://www.mtgpod.xyz/):
space is assigned to cards and public zones, with the next decision kept
separate. This implementation retains Riftbound's own zones and controls.

Measured in the in-app browser against the existing synthetic crowded fixture
(36 units, 12 cards in hand, and 12 runes per player):

| Viewport            | Hand card height | Battlefield card height |
| ------------------- | ---------------: | ----------------------: |
| 1366 × 768          |           123 px |                  124 px |
| 1920 × 1080         |           216 px |                  198 px |
| 2560 × 1440         |           306 px |                  305 px |
| 3840 × 2160         |           446 px |                  590 px |
| 390 × 844 (compact) |            57 px |                   58 px |

No card or rune extended outside these viewports and the document had no page
overflow. Crowded cards retain their full art dimensions while their wrappers
overlap; badges continue to follow the physical card. Before the change, the
desktop hand was capped at 64 px tall.

Interactive verification used the action-stack reaction fixture: selected
En Garde, clicked Playful Phantom directly as its target, and observed the
central response and resolution. The hand emptied, energy changed from 8 to 7,
and the unit showed 7 Might with 3 incoming damage after the chain resolved.

The final integrated source passed 1,258 tests in 48 files, the card coverage
check, the TypeScript/Vite production build, and Git whitespace checks. Vite's
existing large-bundle warning remains. Browser measurements are visual/layout
checks, not a claim of new rules coverage.
