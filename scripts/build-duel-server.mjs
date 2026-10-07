import { build } from "esbuild";

// Vercel's Node function transpiler retains extensionless application imports.
// Bundle our rules/catalog into one explicitly named ESM file; keep SDK packages
// external so Node can use their published conditional exports.
await build({
  entryPoints: ["src/server/duel-api.ts"],
  outfile: ".duel-server/handler.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  logLevel: "info",
});

// Check the actual function entry with Node's ESM resolver during every build.
await import("../api/duel.js");
