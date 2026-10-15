import type { CompletedMatch } from "./match-history";

export interface HistoryFilters {
  query: string;
  result: "all" | "wins" | "losses";
  order: "newest" | "oldest" | "shortest";
}
export const defaultHistoryFilters: HistoryFilters = {
  query: "",
  result: "all",
  order: "newest",
};
const normalize = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Search archive metadata without rebuilding replays or changing their order in storage. */
export function filterMatchHistory(
  entries: CompletedMatch[],
  filters: HistoryFilters,
) {
  const terms = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      if (filters.result === "wins" && entry.winner !== 0) return false;
      if (filters.result === "losses" && entry.winner !== 1) return false;
      const matchup = normalize(
        `${entry.playerDeckName} ${entry.opponentDeckName}`,
      );
      return terms.every((term) => matchup.includes(term));
    })
    .sort((a, b) => {
      const newest = Date.parse(b.endedAt) - Date.parse(a.endedAt);
      if (filters.order === "oldest") return -newest;
      if (filters.order === "shortest") return a.turns - b.turns || newest;
      return newest;
    });
}
