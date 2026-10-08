# Significant game moments

The live game uses short, silent vector animations for a signature champion's
public entrance, gained points, actual combat impact, a successfully resolved
counter and victory. Routine draws, rune updates, Hidden actions, card
announcements and phase changes do not mount these players.

| Tool                              | Authoring source                                        | Live use                                             |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Tesseract 0.3.1                   | [Editable native sigils](tesseract/README.md)           | Brass diamond, teal wings and trophy geometry        |
| Remotion 4.0.534                  | [Signature and victory compositions](remotion/Root.tsx) | Frame-based SVG playback through `@remotion/player`  |
| Hyperframes 0.8.141 / GSAP 3.15.0 | [Editable tactical composition](hyperframes/README.md)  | The same finite combat, counter and scoring timeline |

Remotion and GSAP are separate lazy chunks. They own only decorative children,
with no video downloads, sound, game-state writes, new decisions or added review
delay. The existing public text carries the event and its single announcement;
decorations are hidden from assistive technology and cannot receive focus.

Pause, open dialogs, background tabs and mobile menus suspend playback. Resume
continues the current animation; each displayed transition has its own key.
The 0.5×, 1× and 2× settings scale both clocks. Reduced motion uses a still pose
and reacts to preference changes while the game is open. If a motion chunk
cannot load, a static icon preserves the notice and gameplay remains usable.

Signature/victory seals last 2.4 seconds at 1×; tactical accents last 1.25 seconds.
They stop on frame advance, without waiting for the animation to finish. Short
desktop notices and landscape placements leave scores and controls visible.
Conquer and Hold use the same scoring accent while retaining their actual labels.

To edit the exact live Remotion compositions:

```sh
npm run motion:studio
```

The local Studio registers `SignatureSeal` and `VictorySeal`, with each vector
layer editable. Hyperframes' README includes its pinned preview, rebuild and
validation commands. Tesseract source documents remain portable and editable;
rendered preview videos stay outside the application bundle.
