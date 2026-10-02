import type { Card } from "../src/data/cards";

export const API_BASE: string;
export function serializeCatalog(value: unknown): string;
export function catalogDigest(cards: unknown): string;
export interface CatalogSnapshotMeta {
  provider: string;
  apiBase: string;
  documentation: string;
  schema: string;
  schemaVersion: number;
  startedAt: string;
  fetchedAt: string;
  scope: string;
  count: number;
  uniqueNames: number;
  variantCount: number;
  sourceUpdatedAt: string | null;
  cardDataSha256: string;
  banListDate: string;
  banListSource: string;
  sets: {
    id: string;
    name: string;
    releasedAt: string;
    count: number;
    providerCount: number;
  }[];
  removedIds: string[];
  attribution: string;
}
export function downloadPages<T extends { id: string }>(
  get: (path: string) => Promise<unknown>,
  path: string,
  options?: {
    pageSize?: number;
    onPage?: (progress: {
      path: string;
      page: number;
      pages: number;
    }) => void | Promise<void>;
  },
): Promise<T[]>;
export function buildCatalogSnapshot(
  rawCards: unknown,
  rawSets: unknown,
  options: {
    previousCards?: readonly Card[];
    banList: { names: readonly string[]; effectiveAt: string; source: string };
    fetchedAt: string;
    startedAt?: string;
    allowRemovals?: boolean;
  },
): { cards: Card[]; meta: CatalogSnapshotMeta };
