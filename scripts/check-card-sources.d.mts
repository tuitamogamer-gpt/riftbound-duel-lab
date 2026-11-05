export interface LiveSet {
  set_id: string;
  name: string;
  card_count: number;
}
export function compareSources(input: {
  meta: { count: number; sets: { id: string; providerCount: number }[] };
  liveSets: LiveSet[];
  liveCardTotal: number;
}): string[];
export function checkCardSources(options?: { full?: boolean }): Promise<{
  changes: string[];
  liveSets: LiveSet[];
  liveCardTotal: number;
}>;
