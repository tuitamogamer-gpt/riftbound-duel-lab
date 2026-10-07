# Production deployment

## Practice tools release — 7 October 2026

Application tools were published in `8a1bfca67a2f153bf044ce3356cc49b50547d7a8`; the Node function packaging and guest-base labels were corrected in `bb08fe110334b0a5a3b931c8b72040a28865148d`. Both production builds for the latter commit reached **READY**, with their public aliases confirmed:

- [riftbound-duel-lab.vercel.app](https://riftbound-duel-lab.vercel.app/) — `dpl_2nubG31wQ4wxyTC5C7gSM3S6h2GW`.
- [riftbound-duel-lab-pgml.vercel.app](https://riftbound-duel-lab-pgml.vercel.app/) — `dpl_FkCYQN5dQfRzB159H2cBS1Jbckq4`.

The required GitHub checks passed for both commits. Public Chromium checks verified the primary app's offline shell, lazy screens, first offline bot decision, saved-game reload and portrait/landscape layout. The [offline evidence](offline-production-qa-2026-10-07.json) records 77 cached application assets, 38 selected-deck images, no failed requests and an actual 24-node worker decision without fallback.

Both deployed `/api/duel` functions reject GET with 405 and return the guarded `storage-unavailable` response with 503 when creating a room. Their responses use `private, no-store` and `no-referrer`. The primary app shows a friendly storage message and returns to the lobby at 390×844 and 1440×900. **Online room availability remains blocked by the private Blob store configuration:** the connected account rejected store creation with HTTP 403. See [ONLINE-DUELS.md](ONLINE-DUELS.md) for setup and local two-player validation.

The fresh paired AI pilot completed all 32 games without illegal or blocked games; its outcomes and limits are recorded in [AI-CATALOG-UPDATE.md](AI-CATALOG-UPDATE.md). The consolidated regression inventory covers 2,568 unique passing cases and all 169 ordered precon pairs. It combines completed checkpoints, recovered executed assertions and exact reruns, while preserving original interrupted/failed process status. See [VALIDATION.md](VALIDATION.md) and the [coverage record](regression-validation-2026-10-07.json).

The final follow-up corrects loading Pack of Wonders' legal Hidden board-card choices, adds positive and malformed-save regressions, and prevents long deterministic test loops from starving runner acknowledgements. Production compilation and the actual Node function-entry import pass with this save correction. These changes leave the paired AI pilot's engine, planner and catalog inputs intact.

## Initial release — 2 October 2026

Published on **2 October 2026**.

- Public URL: https://riftbound-duel-lab.vercel.app/
- Private source repository: https://github.com/tuitamogamer-gpt/riftbound-duel-lab
- GitHub account: `tuitamogamer-gpt`; branch: `main`.
- Vercel account: `tuitamogamer-7851`; team: `tuitamogamer-7851s-projects`.
- Vercel project: `riftbound-duel-lab` (`prj_vSRYnKQZudmN7OY9uHdq35AXHZw0`).
- Deployed application commit: `bc045d8f4ecde78b637264f1d8e10b59e6b417c6`.
- Deployment: `dpl_ERb6EPmadkoBPy84XdQ3rmAYzcTH`; target: production; status: READY.
- Build: Vite 7.3.6, TypeScript and `npm run build`; remote build approximately 28 seconds.
- Inspector: https://vercel.com/tuitamogamer-7851s-projects/riftbound-duel-lab/ERb6EPmadkoBPy84XdQ3rmAYzcTH

## Verification

Before publishing, all **1,031 tests in 35 files** passed, along with `npm run cards:check`, `npm run build`, and `git diff --check`. The existing Vite chunk-size warning remains non-blocking.

Vercel metadata confirms the deployed GitHub commit and production alias. An unauthenticated HTTP request to the public URL returned **200**. The response includes `nosniff`, `DENY` framing and the configured referrer policy.

The public application loaded the lobby and started an Annie versus Lux duel. Keeping the opening hand entered manual review at **step 1/2**. Reloading and selecting **Resume duel** restored the same step. All rendered image elements were loaded, and the browser's captured warning/error log was empty during this smoke test.

![Public production duel after reload and resume](screenshots/production-deployment.jpg)

## Future updates

The first release was pushed with GitHub CLI and deployed with Vercel CLI. The Vercel project now builds production from pushes to `main`. A release is complete only after the deployment for that exact commit reaches READY, the public alias points to it, and the public game passes its smoke test.

From the repository root, after tests and the build pass:

```sh
git push origin main
```

The Vercel CLI remains available for a manual production deploy when needed:

```sh
/Users/boro/.local/share/riftbound-publish/vercel-cli/node_modules/.bin/vercel deploy --prod --yes --scope tuitamogamer-7851s-projects
```

The local `.vercel/` project link and `.env.local` are ignored by Git. Credentials remain in the CLI's normal authentication storage and are not committed. Documentation-only commits still trigger a build but do not change the application.

## Release history

- 2026-10-05, commit `786f5f7`: visual system pass (match table skin, lobby and dialog polish); see [DESIGN-REVIEW.md](DESIGN-REVIEW.md). Deployed automatically from `main`.
