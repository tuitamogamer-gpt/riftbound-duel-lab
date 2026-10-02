/**
 * Official default champion splashes cached locally from Riot's Wild Rift pages.
 * See docs/ART-SOURCES.md for the source page and original asset URL.
 */
const championArtwork: Record<string, string> = {
  annie: "/art/champions/annie.jpg",
  lux: "/art/champions/lux.jpg",
  garen: "/art/champions/garen.jpg",
  "master yi": "/art/champions/master-yi.jpg",
  jinx: "/art/champions/jinx.jpg",
  viktor: "/art/champions/viktor.jpg",
  "lee sin": "/art/champions/lee-sin.jpg",
  fiora: "/art/champions/fiora.jpg",
  rumble: "/art/champions/rumble.jpg",
  vi: "/art/champions/vi.jpg",
  vex: "/art/champions/vex.jpg",
  shen: "/art/champions/shen.jpg",
  zed: "/art/champions/zed.jpg",
};

/** Unknown imported champions have no assumed artwork. */
export function championArt(champion: string): string | undefined {
  const key = champion
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, " ");
  return Object.hasOwn(championArtwork, key) ? championArtwork[key] : undefined;
}
