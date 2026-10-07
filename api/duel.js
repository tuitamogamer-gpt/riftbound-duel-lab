// npm run build bundles the authoritative engine into this explicit ESM target.
// Node can load it without resolving the source tree's TypeScript-only imports.
export { default } from "../.duel-server/handler.mjs";
