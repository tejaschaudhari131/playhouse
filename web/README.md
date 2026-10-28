# Playhouse web app

Next.js, React and MapLibre. `/` opens Studio. The legacy Explorer has been removed; `/explore` redirects old bookmarks to Studio, preserving the parcel when available. Old six-factor weights and A/B scenarios are not imported.

Use Node.js 22 or newer:

```bash
cd web
npm ci
npm run dev
```

Open http://localhost:3000. Run `npm test` and `npm run build` before releasing; `npm start` serves the production build.

Dependency security check (2026-10-27): Next.js is pinned to 15.5.28, the maintained 15.x patch for the [image-processing vulnerability](https://github.com/advisories/GHSA-2464-fhr4-w9xw). The lockfile also includes patched Sharp, Undici, Zod and source-map-js releases. `npm audit` reports no known vulnerabilities for this lockfile; rerun it before releases because advisories change.

## Deploy

Vercel: select **Next.js**, root directory **web**, and use the default build settings. The existing project deploys from `main`. All required data is committed in `public/data/`; no Python pipeline or database is needed for hosting.

The build prepares the MapLibre worker files automatically. No AI provider, explanation API, database or environment secrets are required. Current plans transfer through Studio’s JSON export/import.

See the [main README](../README.md) for features and the [Studio guide](../docs/PLANNER.md) for model details.
