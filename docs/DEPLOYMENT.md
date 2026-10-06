# Production deployment

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
