import type { StarterDeck } from "../data/decks";
import type { Difficulty } from "./ai/config";
import { resolveBattlefieldChoice } from "./battlefield-selection";
import type { GameState } from "./types";

export const LOBBY_PREFERENCES_KEY = "riftbound-lobby-preferences-v1";
export interface LobbyPreferences {
  version: 1;
  playerDeck: string;
  botDeck: string;
  difficulty: Difficulty;
  firstPlayerChoice: "random" | "you" | "bot";
  matchFormat: "single" | "bo3";
  fieldChoices: Record<string, string>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Restore only existing decks and playable battlefields; never alter the saved duel. */
export function readLobbyPreferences(
  decks: StarterDeck[],
  saved: GameState | null,
  storage?: Pick<Storage, "getItem">,
): LobbyPreferences {
  let raw: Record<string, unknown> = {};
  try {
    const value = JSON.parse(
      (storage ?? globalThis.localStorage).getItem(LOBBY_PREFERENCES_KEY) ??
        "null",
    );
    if (record(value) && value.version === 1) raw = value;
  } catch {
    /* The current session still works without preference storage. */
  }
  const available = new Set(decks.map((deck) => deck.id));
  const deck = (
    value: unknown,
    previous: string | undefined,
    fallback: number,
  ) =>
    typeof value === "string" && available.has(value)
      ? value
      : previous && available.has(previous)
        ? previous
        : (decks[fallback]?.id ?? decks[0]?.id ?? "");
  const fieldChoices: Record<string, string> = {};
  if (record(raw.fieldChoices))
    for (const [key, value] of Object.entries(raw.fieldChoices).slice(0, 200)) {
      const owner = key.startsWith("player:")
        ? "player"
        : key.startsWith("bot:")
          ? "bot"
          : null;
      if (
        !owner ||
        !available.has(key.slice(owner.length + 1)) ||
        typeof value !== "string"
      )
        continue;
      const field = resolveBattlefieldChoice(value);
      if (field) fieldChoices[key] = field.id;
    }
  // Existing players without preferences keep the setup of their saved duel.
  if (!Object.keys(raw).length && saved)
    for (const [index, owner] of ["player", "bot"].entries()) {
      const field = resolveBattlefieldChoice(saved.fields[index]?.cardId ?? "");
      if (field && available.has(saved.players[index].deckId))
        fieldChoices[`${owner}:${saved.players[index].deckId}`] = field.id;
    }
  const difficulty =
    typeof raw.difficulty === "string" &&
    ["beginner", "normal", "hard", "expert"].includes(raw.difficulty)
      ? (raw.difficulty as Difficulty)
      : (saved?.botSettings?.difficulty ?? "normal");
  return {
    version: 1,
    playerDeck: deck(raw.playerDeck, saved?.players[0].deckId, 0),
    botDeck: deck(raw.botDeck, saved?.players[1].deckId, 1),
    difficulty,
    firstPlayerChoice:
      raw.firstPlayerChoice === "you" || raw.firstPlayerChoice === "bot"
        ? raw.firstPlayerChoice
        : "random",
    matchFormat: raw.matchFormat === "bo3" ? "bo3" : "single",
    fieldChoices,
  };
}

export function saveLobbyPreferences(
  value: LobbyPreferences,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      LOBBY_PREFERENCES_KEY,
      JSON.stringify(value),
    );
    return true;
  } catch {
    return false;
  }
}
