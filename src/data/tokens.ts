import type { Card } from "./cards";
/** Tokens whose official rules are printed on the cards that create them.
 * The provider currently omits these token faces; no remote artwork is invented.
 */
const token = (
  id: string,
  name: string,
  might: number,
  tags: string[],
  text = "",
  keywords: string[] = [],
): Card => ({
  id,
  name,
  might,
  tags,
  text,
  keywords,
  riftboundId: id,
  providerId: "",
  type: "Unit",
  supertype: "Token",
  domains: ["Colorless"],
  energy: 0,
  power: 0,
  image: "",
  set: "TOKEN",
  setName: "Official rules token",
  rarity: "Token",
  collectorNumber: 0,
  variant: false,
  artist: null,
  bannedInDuel: false,
});
export const rulesTokens: Card[] = [
  token("token-tentacle", "Tentacle", 1, ["Bilgewater"]),
  token("token-mech", "Mech", 3, ["Mech"]),
  token("token-sand-soldier", "Sand Soldier", 2, ["Sand Soldier"]),
  token(
    "token-bird",
    "Bird",
    1,
    ["Bird"],
    "[Deflect] (Opponents must pay 1 additional any-domain Power to choose me with a spell or ability.)",
    ["Deflect"],
  ),
  token(
    "token-shadow-clone",
    "Shadow Clone",
    0,
    ["Shadow Clone"],
    "When I attack, you may banish a unit from your trash. If you do, give me [Assault 4] this turn.",
  ),
];
