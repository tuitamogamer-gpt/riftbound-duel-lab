# Active card status tokens

Cards now show square status counters for Stunned, marked damage, buffs, temporary Might/Assault/Shield, Empowered, damage prevention, vulnerability, targeting and movement restrictions, death replacement, Temporary, and granted keywords. Exhausted remains a separate readiness marker. Historical play flags and unchanged printed keywords do not add counters.

The board shows two counters and a `+N` count for additional effects. Hover/focus previews and the card's details dialog show every active effect with its meaning. Details use the physical unit or gear ID, so identical card copies keep their own state. Combat review uses the displayed frame, with no future outcome disclosure. Turn-scoped markers disappear when their effects expire.

Presentation is derived in `src/game/status-presentation.ts`; it does not mutate or persist game state. Stun onset, expiry, Temporary lifetime and conditional grants are covered by `tests/status-presentation.test.ts`. Surface and locale checks are in `tests/status-token-surfaces.test.ts`.

Use `/tests/status-tokens-preview.html` on a separate QA origin for stacked effects and `?plain` for their cleared state. `scripts/status-tokens-check.mjs` verifies desktop/mobile tokens, preview synchronization, interaction through overlays and touch-accessible details. It accepts the same `QA_ORIGIN` and `PLAYWRIGHT_MODULE` settings as the gear regression.
