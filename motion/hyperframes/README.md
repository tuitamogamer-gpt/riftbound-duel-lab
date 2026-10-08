# Significant event seal — Hyperframes

This is an editable, deterministic Hyperframes composition for the live game's localized combat impact, successful counter and conquer accents. It uses the **same** GSAP timeline exported by `src/motion/hyperframes-timeline.ts`. No rendered movie is required by the game and no extra authoring player is added to the match UI.

The source design comes from the existing table palette and bundled fonts; see `DESIGN.md`. The authoring view shows each seal at twice the game's maximum 80px footprint, so its choreography is easy to review.

From the repository root, rebuild the authoring bundle after changing the runtime:

```sh
npx esbuild motion/hyperframes/bundle-entry.ts --bundle --format=iife --minify --legal-comments=eof --outfile=motion/hyperframes/tactical-burst.gsap.js
```

From this directory:

```sh
npx --yes hyperframes@0.8.141 lint --json
npx --yes hyperframes@0.8.141 check
npx --yes hyperframes@0.8.141 preview --background --port 3018
npx --yes hyperframes@0.8.141 preview --status
```

Studio preview: `http://localhost:3018/#project/hyperframes`.

The composition registers one paused root timeline synchronously. The parent controls seek/play; every ray position is fixed and every tween is finite. There are no remote fonts, network media, randomness, loops or gameplay state.

Game wrapper contract: an at most 80px decorative, `aria-hidden`, `pointer-events:none` element containing four separate HTMLElement wrappers marked `data-motion-aura`, `data-motion-ring`, `data-motion-rays`, and `data-motion-seal`. SVG icons can live inside those wrappers. Create with `{kind}`, use `.timeScale()` for playback speed, pause at `.54` seconds for the visible hero frame, and kill/revert when the event changes or the component unmounts. For reduced motion create with `{reducedMotion:true}` to retain only a static seal. Never let CSS or Remotion animate the same marked elements.

Only animate public champion entry, actual combat resolution, successful counters, conquered battlefield points, and match victory. Routine phases, draw, runes, ordinary movement, harmless health updates and unsuccessful counters do not use this tactical seal.
