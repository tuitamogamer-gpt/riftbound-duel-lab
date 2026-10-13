import { writeFile } from "node:fs/promises";

/** Keep source URLs and integrity hashes in the audit manifest, out of app bundles. */
export async function writeArtRuntimeIndex(manifest, destination) {
  const runtime = {
    cardCount: manifest.cardCount,
    bytes: manifest.bytes,
    cards: Object.fromEntries(
      Object.entries(manifest.cards).map(([id, entry]) => [id, entry.path]),
    ),
  };
  await writeFile(destination, `${JSON.stringify(runtime, null, 2)}\n`);
}
